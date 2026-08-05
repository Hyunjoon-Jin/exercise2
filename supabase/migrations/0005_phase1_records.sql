-- =============================================================================
-- 0005_phase1_records.sql
-- Phase 1 — 신체기록 · 수면 · 복약
--
-- 여기서 하는 일은 크게 셋이다.
--   1. 파생 지표를 트리거로 자동 생성한다 (수면시간, BMI).
--      클라이언트에서 계산해 넣으면 웹/앱/배치마다 로직이 갈라지므로
--      DB 에서 한 번만 처리한다.
--   2. 복약 스케줄을 특정 날짜의 "예정 복용" 목록으로 전개하는 함수.
--      스케줄은 규칙이고 복용 기록은 사실이므로, 예정 행을 미리 만들어
--      쌓지 않고 조회 시점에 전개한다.
--   3. 웹 푸시 구독 저장.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 수면 기록 → SLEEP_DURATION 파생 지표
--
-- 수면 시간을 health_metrics 에도 넣어야 "수면 vs 체중" 같은 교차 분석이
-- 다른 지표와 같은 쿼리 경로로 나온다. (docs/PLAN.md §3)
-- -----------------------------------------------------------------------------

create or replace function public.sync_sleep_duration_metric()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  minutes integer;
begin
  -- duration_min 이 비어 있으면 취침/기상 시각에서 계산한다.
  minutes := coalesce(
    new.duration_min,
    case
      when new.bed_time is not null and new.wake_time is not null
        then greatest(0, (extract(epoch from (new.wake_time - new.bed_time)) / 60)::integer)
    end
  );

  if minutes is null or minutes <= 0 then
    -- 계산할 수 없으면 기존 파생 행을 지운다 (값을 지운 수정일 수 있으므로).
    delete from public.health_metrics
    where source = 'derived' and metric_code = 'SLEEP_DURATION' and source_ref = new.id;
    return new;
  end if;

  insert into public.health_metrics
    (user_id, metric_code, value, unit, measured_at, source, source_ref)
  values
    (new.user_id, 'SLEEP_DURATION', minutes, 'min',
     -- 기상 시각을 측정 시점으로 본다. 없으면 그 날 정오.
     coalesce(new.wake_time, (new.sleep_date + time '12:00')::timestamptz),
     'derived', new.id)
  on conflict (user_id, metric_code, source_ref)
    where source = 'derived' and source_ref is not null
  do update set
    value = excluded.value,
    measured_at = excluded.measured_at,
    updated_at = now();

  return new;
end;
$$;

create trigger sleep_records_sync_metric
  after insert or update on public.sleep_records
  for each row execute function public.sync_sleep_duration_metric();

-- 수면 기록을 지우면 파생 지표도 함께 사라져야 한다.
create or replace function public.delete_sleep_duration_metric()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.health_metrics
  where source = 'derived' and metric_code = 'SLEEP_DURATION' and source_ref = old.id;
  return old;
end;
$$;

create trigger sleep_records_delete_metric
  after delete on public.sleep_records
  for each row execute function public.delete_sleep_duration_metric();


-- -----------------------------------------------------------------------------
-- 2. 체중 → BMI 파생 지표
--
-- 프로필에 키가 있을 때만 계산한다. 키를 나중에 입력한 경우를 위해
-- 프로필 갱신 시 과거 체중 기록에 대해서도 다시 계산한다.
-- -----------------------------------------------------------------------------

create or replace function public.sync_bmi_metric()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  height_m numeric;
begin
  -- BMI 자체가 삽입될 때는 아무것도 하지 않는다 (재귀 방지).
  if new.metric_code <> 'WEIGHT' then
    return new;
  end if;

  select height_cm / 100.0 into height_m
  from public.profiles
  where id = new.user_id;

  if height_m is null or height_m <= 0 then
    return new;
  end if;

  insert into public.health_metrics
    (user_id, metric_code, value, unit, measured_at, source, source_ref)
  values
    (new.user_id, 'BMI', round(new.value / (height_m * height_m), 1), 'kg/m2',
     new.measured_at, 'derived', new.id)
  on conflict (user_id, metric_code, source_ref)
    where source = 'derived' and source_ref is not null
  do update set
    value = excluded.value,
    measured_at = excluded.measured_at,
    updated_at = now();

  return new;
end;
$$;

create trigger health_metrics_sync_bmi
  after insert or update on public.health_metrics
  for each row execute function public.sync_bmi_metric();


create or replace function public.delete_bmi_metric()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.metric_code = 'WEIGHT' then
    delete from public.health_metrics
    where source = 'derived' and metric_code = 'BMI' and source_ref = old.id;
  end if;
  return old;
end;
$$;

create trigger health_metrics_delete_bmi
  after delete on public.health_metrics
  for each row execute function public.delete_bmi_metric();


-- 키를 나중에 입력했거나 수정한 경우, 기존 체중 기록의 BMI 를 다시 계산한다.
create or replace function public.recalculate_bmi_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.height_cm is distinct from old.height_cm then
    -- 기존 파생 BMI 를 모두 지우고
    delete from public.health_metrics
    where user_id = new.id and source = 'derived' and metric_code = 'BMI';

    -- 체중 기록을 건드려 트리거를 다시 태운다.
    if new.height_cm is not null and new.height_cm > 0 then
      update public.health_metrics
      set updated_at = now()
      where user_id = new.id and metric_code = 'WEIGHT';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_recalculate_bmi
  after update on public.profiles
  for each row execute function public.recalculate_bmi_for_user();


-- -----------------------------------------------------------------------------
-- 3. 복약 — 특정 날짜의 예정 복용 전개
--
-- 스케줄(규칙)에서 그 날의 예정 복용을 만들어 내고, 기록된 복용 로그를
-- 왼쪽 조인한다. 예정 행을 미리 INSERT 해 두면 스케줄이 바뀔 때마다
-- 과거·미래 행을 정리해야 하므로 조회 시점에 전개하는 편이 단순하다.
-- -----------------------------------------------------------------------------

create or replace function public.medication_doses_for_date(target_date date)
returns table (
  schedule_id      uuid,
  medication_id    uuid,
  medication_name  text,
  dosage_amount    numeric,
  dosage_unit      text,
  time_of_day      time,
  quantity         numeric,
  scheduled_for    timestamptz,
  log_id           uuid,
  status           public.medication_log_status
)
language sql
stable
security invoker
set search_path = public
as $$
  with tz as (
    select coalesce(p.timezone, 'Asia/Seoul') as zone
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  expected as (
    select
      s.id                                   as schedule_id,
      m.id                                   as medication_id,
      m.name                                 as medication_name,
      m.dosage_amount,
      m.dosage_unit,
      s.time_of_day,
      s.quantity,
      ((target_date + s.time_of_day) at time zone (select zone from tz)) as scheduled_for
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
    where s.user_id = (select auth.uid())
      and m.is_active
      and (m.started_on is null or m.started_on <= target_date)
      and (m.ended_on is null or m.ended_on >= target_date)
      -- days_of_week 는 0=일요일. extract(dow) 와 같은 규약.
      and extract(dow from target_date)::smallint = any (s.days_of_week)
  )
  select
    e.schedule_id,
    e.medication_id,
    e.medication_name,
    e.dosage_amount,
    e.dosage_unit,
    e.time_of_day,
    e.quantity,
    e.scheduled_for,
    l.id      as log_id,
    l.status
  from expected e
  left join public.medication_logs l
    on l.schedule_id = e.schedule_id
   and l.scheduled_for = e.scheduled_for
  order by e.time_of_day, e.medication_name;
$$;

comment on function public.medication_doses_for_date is
  '스케줄을 해당 날짜의 예정 복용으로 전개하고 복용 기록을 붙인다. '
  '예정 행을 미리 쌓지 않으므로 스케줄 변경이 과거 기록을 훼손하지 않는다.';


-- -----------------------------------------------------------------------------
-- 4. 복약 순응도
--
-- 예정 복용 대비 실제 복용 비율. 오늘은 아직 지나지 않은 복용이 있으므로
-- 기본적으로 어제까지를 집계 대상으로 삼는다.
-- -----------------------------------------------------------------------------

create or replace function public.medication_adherence(days integer default 7)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with dates as (
    select generate_series(
      (current_date - days)::date,
      (current_date - 1)::date,
      interval '1 day'
    )::date as d
  ),
  -- lateral 로 호출해야 날짜당 한 번만 평가된다.
  -- select (f(d)).* 형태는 컬럼 수만큼 함수를 반복 호출한다.
  doses as (
    select dose.status
    from dates
    cross join lateral public.medication_doses_for_date(dates.d) as dose
  )
  select case
    when count(*) = 0 then null
    else round(100.0 * count(*) filter (where status = 'taken') / count(*), 0)
  end
  from doses;
$$;

comment on function public.medication_adherence is
  '최근 N일(오늘 제외) 복약 순응도(%). 예정 복용이 없으면 null.';


-- -----------------------------------------------------------------------------
-- 5. 지표별 최신값
--
-- PostgREST 로는 distinct on 을 표현할 수 없어 함수로 둔다.
-- 지표 목록 화면이 매번 호출하므로 인덱스(user_id, metric_code, measured_at desc)를
-- 그대로 타도록 작성했다.
-- -----------------------------------------------------------------------------

create or replace function public.latest_metrics()
returns table (
  id          uuid,
  metric_code text,
  value       numeric,
  unit        text,
  measured_at timestamptz,
  source      public.metric_source
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.metric_code)
    m.id, m.metric_code, m.value, m.unit, m.measured_at, m.source
  from public.health_metrics m
  where m.user_id = (select auth.uid())
  order by m.metric_code, m.measured_at desc;
$$;

comment on function public.latest_metrics is
  '지표별 가장 최근 값 한 건씩. 지표 목록 화면용.';


-- -----------------------------------------------------------------------------
-- 6. 웹 푸시 구독
--
-- 복약 알림 발송 대상. 브라우저마다 endpoint 가 다르므로 한 사용자가
-- 여러 구독을 가질 수 있다 (데스크톱 + 모바일).
-- -----------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  -- 발송 실패가 누적되면 만료된 구독으로 보고 정리한다.
  failure_count smallint not null default 0,
  last_used_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

comment on table public.push_subscriptions is
  '웹 푸시 구독. p256dh/auth_key 는 브라우저가 발급한 공개키로 비밀값이 아니지만, '
  '어떤 기기를 쓰는지 드러나므로 본인만 접근하게 둔다.';

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "본인 구독 조회"
  on public.push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 구독 등록"
  on public.push_subscriptions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 구독 수정"
  on public.push_subscriptions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 구독 삭제"
  on public.push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);
