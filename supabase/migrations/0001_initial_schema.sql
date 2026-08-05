-- =============================================================================
-- 0001_initial_schema.sql
-- 통합 건강관리 플랫폼 — 초기 스키마
--
-- 설계 원칙 (docs/PLAN.md §3, §4 참고)
--   1. 모든 수치형 건강 데이터는 health_metrics 단일 테이블에 통합한다.
--      자가측정(self)과 건강검진(checkup)이 같은 시계열에 올라가야 하기 때문.
--   2. 지표 추가는 스키마 변경이 아니라 metric_definitions 행 추가로 처리한다.
--   3. 사용자 데이터 테이블은 예외 없이 user_id 를 갖고 RLS 로 격리한다.
--      (정책은 0002_rls_policies.sql)
--   4. 검진 자동판독 결과는 원본을 보존하고, 사용자가 확정한 항목만
--      health_metrics 로 승격한다.
-- =============================================================================

create extension if not exists "pgcrypto";
-- 음식명 한글 부분일치 검색용 (foods.search_text GIN 인덱스)
create extension if not exists "pg_trgm";

-- -----------------------------------------------------------------------------
-- 공통 유틸
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 1. 사용자 프로필 · 동의
-- =============================================================================

create type public.biological_sex as enum ('male', 'female', 'unspecified');

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  birth_year    smallint check (birth_year between 1900 and 2100),
  sex           public.biological_sex not null default 'unspecified',
  height_cm     numeric(5, 1) check (height_cm > 0 and height_cm < 300),
  timezone      text not null default 'Asia/Seoul',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  '사용자 프로필. 최소 수집 원칙 — 주민번호 등 고유식별정보는 저장하지 않는다.';
comment on column public.profiles.birth_year is
  '연령대별 정상범위 판정에만 사용. 생년월일 전체는 수집하지 않는다.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- 동의 문서 — 버전 관리. 문구가 바뀌면 새 버전을 발행하고 재동의를 받는다.
create type public.consent_kind as enum (
  'terms_of_service',      -- 이용약관 (필수)
  'privacy_policy',        -- 개인정보 처리방침 (필수)
  'sensitive_health_data', -- 건강정보=민감정보 별도 동의 (필수, 법정)
  -- 검진 결과지 외부 LLM 처리 동의. 선택이다 — 거부해도 수치를 직접 입력해
  -- 서비스를 그대로 쓸 수 있으므로 필수로 둘 근거가 없다 (0004 의 is_required).
  'llm_processing',
  'marketing'              -- 마케팅 수신 (선택)
);

create table public.consent_documents (
  id             uuid primary key default gen_random_uuid(),
  kind           public.consent_kind not null,
  version        text not null,
  title          text not null,
  body           text not null,
  is_required    boolean not null default true,
  effective_from timestamptz not null default now(),
  retired_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (kind, version)
);

comment on table public.consent_documents is
  '동의 문서 원문. 과거 버전은 삭제하지 않는다 — 사용자가 무엇에 동의했는지 입증해야 하므로.';

create index consent_documents_active_idx
  on public.consent_documents (kind, effective_from desc)
  where retired_at is null;


-- 동의 이력 — append-only. 철회는 revoked_at 을 채우고 새 행을 쌓는다.
create table public.user_consents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  consent_document_id uuid not null references public.consent_documents (id),
  granted             boolean not null,
  granted_at          timestamptz not null default now(),
  revoked_at          timestamptz,
  user_agent          text,
  created_at          timestamptz not null default now()
);

comment on table public.user_consents is
  '동의 이력. UPDATE/DELETE 를 RLS 로 막고 INSERT 만 허용해 감사 추적을 보존한다.';

create index user_consents_user_idx on public.user_consents (user_id, granted_at desc);


-- =============================================================================
-- 2. 지표 마스터 — 이 제품의 중심
-- =============================================================================

create type public.metric_category as enum (
  'body',      -- 체성분: 체중, 체지방률, 골격근량
  'vital',     -- 활력징후: 혈압, 심박
  'glucose',   -- 혈당
  'lipid',     -- 지질: 총콜레스테롤, HDL, LDL, 중성지방
  'liver',     -- 간기능: AST, ALT, GGT
  'kidney',    -- 신장기능: 크레아티닌, eGFR, BUN
  'blood',     -- 혈액: 혈색소, 헤마토크릿
  'thyroid',   -- 갑상선: TSH, T4
  'urine',     -- 요검사
  'lifestyle'  -- 생활 파생지표: 섭취칼로리, 수면시간, 운동시간
);

create table public.metric_definitions (
  code           text primary key,
  display_name   text not null,
  short_name     text,
  unit           text not null,
  category       public.metric_category not null,
  decimal_places smallint not null default 1 check (decimal_places between 0 and 3),
  min_valid      numeric,                -- 입력 검증용 물리적 하한
  max_valid      numeric,                -- 입력 검증용 물리적 상한
  higher_is_better boolean,              -- null = 범위 안이 좋음 (양방향)
  loinc_code     text,                   -- 향후 표준 연동 여지
  description    text,
  sort_order     smallint not null default 100,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.metric_definitions is
  '지표 마스터. 신규 지표 추가는 이 테이블에 행을 넣는 것으로 끝난다 — 스키마 변경 없음.';
comment on column public.metric_definitions.loinc_code is
  'LOINC 전체 도입은 과하므로 자체 코드를 쓰되, 표준 매핑 여지를 남긴다.';

create index metric_definitions_category_idx
  on public.metric_definitions (category, sort_order)
  where is_active;


-- 정상범위 — 성별/연령별로 다르므로 별도 테이블
create table public.metric_reference_ranges (
  id           uuid primary key default gen_random_uuid(),
  metric_code  text not null references public.metric_definitions (code) on delete cascade,
  sex          public.biological_sex,   -- null = 성별 무관
  age_min      smallint,                -- null = 하한 없음
  age_max      smallint,                -- null = 상한 없음
  normal_low   numeric,
  normal_high  numeric,
  -- 주의 구간: 정상은 아니나 이상도 아닌 경계값 (예: 공복혈당 100~125)
  caution_low  numeric,
  caution_high numeric,
  source       text,                    -- 근거 출처 (대한진단검사의학회 등)
  created_at   timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

comment on table public.metric_reference_ranges is
  '정상범위. 의료법상 진단 표현은 금지되므로 UI 는 정상/주의/범위밖 표시까지만 하고 '
  '"당뇨 의심" 같은 판단 문구는 절대 쓰지 않는다.';

create index metric_reference_ranges_lookup_idx
  on public.metric_reference_ranges (metric_code, sex);


-- =============================================================================
-- 3. health_metrics — 모든 수치가 모이는 곳
-- =============================================================================

create type public.metric_source as enum (
  'self',    -- 사용자 직접 입력
  'checkup', -- 건강검진 결과지에서 확정된 값
  'device',  -- 웨어러블/기기 연동 (Post-MVP)
  'derived'  -- 식단/운동/수면 기록에서 자동 집계된 파생값
);

create table public.health_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  metric_code  text not null references public.metric_definitions (code),
  value        numeric not null,
  unit         text not null,
  measured_at  timestamptz not null,
  source       public.metric_source not null default 'self',
  -- 출처 추적: checkup 이면 checkups.id, derived 면 원본 레코드 id
  source_ref   uuid,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.health_metrics is
  '이 제품의 중심 테이블. 자가측정과 검진 수치가 같은 시계열에 올라가야 '
  '"혈당 추세" 같은 화면이 단일 쿼리로 나온다.';

-- 시계열 조회가 지배적 패턴: 특정 사용자의 특정 지표를 시간 역순으로
create index health_metrics_series_idx
  on public.health_metrics (user_id, metric_code, measured_at desc);

-- 대시보드: 특정 사용자의 최근 전체 기록
create index health_metrics_recent_idx
  on public.health_metrics (user_id, measured_at desc);

-- 파생값 재계산 시 기존 행을 찾기 위한 인덱스
create index health_metrics_source_ref_idx
  on public.health_metrics (source_ref)
  where source_ref is not null;

-- 파생값은 원본 1건당 1행이어야 한다 (재계산 시 upsert)
create unique index health_metrics_derived_unique_idx
  on public.health_metrics (user_id, metric_code, source_ref)
  where source = 'derived' and source_ref is not null;

create trigger health_metrics_set_updated_at
  before update on public.health_metrics
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 4. 수면
-- =============================================================================

create table public.sleep_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  sleep_date   date not null,           -- 기상일 기준
  bed_time     timestamptz,
  wake_time    timestamptz,
  duration_min integer check (duration_min > 0 and duration_min <= 1440),
  quality      smallint check (quality between 1 and 5),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, sleep_date)
);

create index sleep_records_user_date_idx
  on public.sleep_records (user_id, sleep_date desc);

create trigger sleep_records_set_updated_at
  before update on public.sleep_records
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 5. 복약
-- =============================================================================

create type public.medication_form as enum (
  'tablet', 'capsule', 'liquid', 'injection', 'topical', 'inhaler', 'other'
);

create type public.medication_log_status as enum ('taken', 'skipped', 'missed');

create table public.medications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  dosage_amount numeric,
  dosage_unit   text,                   -- mg, ml, 정, 포 ...
  form          public.medication_form not null default 'tablet',
  purpose       text,
  started_on    date,
  ended_on      date,
  is_active     boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ended_on is null or started_on is null or ended_on >= started_on)
);

create index medications_user_active_idx
  on public.medications (user_id)
  where is_active;

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();


create table public.medication_schedules (
  id               uuid primary key default gen_random_uuid(),
  medication_id    uuid not null references public.medications (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  time_of_day      time not null,
  -- 0=일요일 … 6=토요일. 기본은 매일.
  days_of_week     smallint[] not null default '{0,1,2,3,4,5,6}',
  quantity         numeric not null default 1,
  reminder_enabled boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index medication_schedules_user_idx
  on public.medication_schedules (user_id, time_of_day);

create trigger medication_schedules_set_updated_at
  before update on public.medication_schedules
  for each row execute function public.set_updated_at();


create table public.medication_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  schedule_id   uuid references public.medication_schedules (id) on delete set null,
  scheduled_for timestamptz not null,
  taken_at      timestamptz,
  status        public.medication_log_status not null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 같은 스케줄의 같은 시각에 대한 기록은 1건
  unique (schedule_id, scheduled_for)
);

comment on table public.medication_logs is
  '복용 순응도 계산의 근거. 알림 스케줄러가 미리 행을 만들지 않고, '
  '체크 시점 또는 미복용 판정 시점에 생성한다.';

create index medication_logs_user_time_idx
  on public.medication_logs (user_id, scheduled_for desc);

create trigger medication_logs_set_updated_at
  before update on public.medication_logs
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 6. 식단
-- =============================================================================

-- 음식 마스터 — 사용자 데이터가 아니므로 전체 공개 읽기. 식약처 공공 API 캐시.
create table public.foods (
  code          text primary key,       -- 'MFDS:{품목보고번호}' 또는 'CUSTOM:{uuid}'
  name          text not null,
  brand         text,
  source        text not null default 'mfds',
  serving_size  numeric not null default 100,
  serving_unit  text not null default 'g',
  kcal          numeric,
  carb_g        numeric,
  protein_g     numeric,
  fat_g         numeric,
  sugar_g       numeric,
  sodium_mg     numeric,
  fiber_g       numeric,
  search_text   text,                   -- 한글 검색용 정규화 문자열
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index foods_search_idx on public.foods using gin (search_text gin_trgm_ops);

create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();


create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.meals (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  meal_type public.meal_type not null,
  eaten_at  timestamptz not null,
  note      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meals_user_time_idx on public.meals (user_id, eaten_at desc);

create trigger meals_set_updated_at
  before update on public.meals
  for each row execute function public.set_updated_at();


create table public.meal_items (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references public.meals (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  food_code   text references public.foods (code),
  custom_name text,                     -- 음식 DB 에 없는 경우 직접 입력
  quantity    numeric not null default 1,
  unit        text not null default 'serving',
  -- 영양성분은 기록 시점 값을 스냅샷으로 저장한다.
  -- foods 마스터가 갱신돼도 과거 기록이 바뀌면 안 되므로.
  kcal        numeric,
  carb_g      numeric,
  protein_g   numeric,
  fat_g       numeric,
  created_at  timestamptz not null default now(),
  check (food_code is not null or custom_name is not null)
);

comment on column public.meal_items.kcal is
  '기록 시점 스냅샷. foods 마스터 갱신이 과거 기록을 소급 변경하면 안 된다.';

create index meal_items_meal_idx on public.meal_items (meal_id);
create index meal_items_user_idx on public.meal_items (user_id);


-- =============================================================================
-- 7. 운동
-- =============================================================================

-- 운동 마스터 — 공개 읽기. MET 값으로 소모 칼로리를 추정한다.
create table public.exercises (
  code       text primary key,
  name       text not null,
  category   text not null,             -- cardio | strength | flexibility | sports
  met        numeric,                   -- Metabolic Equivalent of Task
  created_at timestamptz not null default now()
);

create type public.workout_intensity as enum ('light', 'moderate', 'vigorous');

create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  exercise_code    text references public.exercises (code),
  custom_name      text,
  started_at       timestamptz not null,
  duration_min     integer not null check (duration_min > 0 and duration_min <= 1440),
  intensity        public.workout_intensity not null default 'moderate',
  calories_burned  numeric,
  distance_km      numeric,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (exercise_code is not null or custom_name is not null)
);

create index workouts_user_time_idx on public.workouts (user_id, started_at desc);

create trigger workouts_set_updated_at
  before update on public.workouts
  for each row execute function public.set_updated_at();


create table public.workout_sets (
  id         uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  set_no     smallint not null,
  reps       smallint,
  weight_kg  numeric,
  created_at timestamptz not null default now(),
  unique (workout_id, set_no)
);

create index workout_sets_user_idx on public.workout_sets (user_id);


-- =============================================================================
-- 8. 건강검진 — 자동판독 파이프라인
-- =============================================================================

create table public.checkups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  checkup_date date not null,
  institution  text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index checkups_user_date_idx on public.checkups (user_id, checkup_date desc);

create trigger checkups_set_updated_at
  before update on public.checkups
  for each row execute function public.set_updated_at();


create table public.checkup_documents (
  id           uuid primary key default gen_random_uuid(),
  checkup_id   uuid not null references public.checkups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,           -- 비공개 버킷 경로. signed URL 로만 접근.
  file_name    text,
  mime_type    text not null,
  size_bytes   bigint,
  page_count   smallint,
  created_at   timestamptz not null default now()
);

comment on table public.checkup_documents is
  '원본 결과지. Storage 비공개 버킷에 두고 단기 만료 signed URL 로만 노출한다.';

create index checkup_documents_checkup_idx on public.checkup_documents (checkup_id);


create type public.extraction_status as enum (
  'pending',   -- 큐 대기
  'running',   -- LLM 호출 중
  'review',    -- 추출 완료, 사용자 검수 대기
  'confirmed', -- 사용자 확정 완료 → health_metrics 반영됨
  'failed'     -- 추출 실패
);

create table public.checkup_extractions (
  id            uuid primary key default gen_random_uuid(),
  checkup_id    uuid not null references public.checkups (id) on delete cascade,
  document_id   uuid not null references public.checkup_documents (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  model         text not null,          -- 예: 'claude-opus-5'
  status        public.extraction_status not null default 'pending',
  raw_output    jsonb,                  -- LLM 원본 응답 (감사·재처리용)
  input_tokens  integer,
  output_tokens integer,
  error_message text,
  started_at    timestamptz,
  completed_at  timestamptz,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.checkup_extractions.raw_output is
  'LLM 원본을 그대로 보존한다. 판독 오류를 추적하고 프롬프트 개선 후 재처리하기 위함.';

create index checkup_extractions_checkup_idx on public.checkup_extractions (checkup_id);
create index checkup_extractions_status_idx
  on public.checkup_extractions (status, created_at)
  where status in ('pending', 'running');

create trigger checkup_extractions_set_updated_at
  before update on public.checkup_extractions
  for each row execute function public.set_updated_at();


create type public.extraction_item_status as enum (
  'pending',   -- 검수 대기
  'accepted',  -- 사용자가 그대로 확정
  'edited',    -- 사용자가 수정 후 확정
  'rejected'   -- 사용자가 제외
);

create table public.checkup_extraction_items (
  id                uuid primary key default gen_random_uuid(),
  extraction_id     uuid not null references public.checkup_extractions (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- LLM 이 뽑은 원본 값 (수정되지 않음 — 대조용)
  raw_label         text not null,      -- 결과지에 적힌 그대로의 항목명
  raw_value         text,
  raw_unit          text,
  reference_range   text,               -- 결과지에 적힌 참고치 문자열
  confidence        numeric check (confidence between 0 and 1),
  page_number       smallint,
  -- 사용자 검수 결과
  metric_code       text references public.metric_definitions (code),
  value             numeric,
  unit              text,
  status            public.extraction_item_status not null default 'pending',
  -- 확정 시 생성된 health_metrics 행
  health_metric_id  uuid references public.health_metrics (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.checkup_extraction_items is
  '자동 저장 금지. status 가 accepted/edited 로 바뀌는 시점에만 health_metrics 로 승격한다. '
  'raw_* 컬럼은 원본 대조용이므로 사용자 수정으로 덮어쓰지 않는다.';

create index checkup_extraction_items_extraction_idx
  on public.checkup_extraction_items (extraction_id, page_number, id);

create trigger checkup_extraction_items_set_updated_at
  before update on public.checkup_extraction_items
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 9. 신규 가입 시 프로필 자동 생성
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
