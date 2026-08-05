-- =============================================================================
-- 0007_phase2_diet_exercise.sql
-- Phase 2 — 식단 · 운동
--
-- 핵심 설계
--   1. 하루 섭취/소모를 health_metrics 에 파생 기록으로 남긴다.
--      그래야 "섭취 칼로리 vs 체중" 같은 교차 분석이 다른 지표와 같은
--      쿼리 경로로 나온다. (docs/PLAN.md §3)
--   2. 일 단위 집계의 source_ref 는 (사용자, 날짜)로 만든 결정적 UUID 다.
--      health_metrics 의 파생 유니크 인덱스가 source_ref 를 쓰기 때문에
--      날짜마다 안정적인 값이 필요하다.
--   3. 사용자가 직접 만든 음식은 공용 마스터가 아니라 user_foods 에 넣는다.
--      공용 foods 에 사용자 쓰기를 열면 다른 사용자에게 그대로 노출된다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 일 단위 파생 지표의 source_ref
--
-- md5 는 32자 hex 라 uuid 로 그대로 캐스팅된다. 같은 (사용자, 날짜, 종류)면
-- 항상 같은 값이 나오므로 upsert 가 성립한다.
-- -----------------------------------------------------------------------------

create or replace function public.daily_source_ref(
  kind text,
  p_user_id uuid,
  p_date date
)
returns uuid
language sql
immutable
as $$
  select md5(kind || ':' || p_user_id::text || ':' || p_date::text)::uuid;
$$;

comment on function public.daily_source_ref is
  '일 단위 집계용 결정적 UUID. health_metrics 의 파생 유니크 인덱스와 짝을 이룬다.';


/** 사용자 타임존. 프로필이 없거나 비어 있으면 서울. */
create or replace function public.user_timezone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.timezone, 'Asia/Seoul') from public.profiles p where p.id = p_user_id;
$$;


-- -----------------------------------------------------------------------------
-- 2. 사용자 정의 음식
--
-- 공용 foods 마스터는 공공 API 캐시 전용이고, 여기는 개인 영역이다.
-- meal_items 는 둘 중 어느 쪽이든 참조할 수 있게 code 문자열로만 연결한다.
-- -----------------------------------------------------------------------------

create table public.user_foods (
  code         text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  brand        text,
  serving_size numeric not null default 100,
  serving_unit text not null default 'g',
  kcal         numeric,
  carb_g       numeric,
  protein_g    numeric,
  fat_g        numeric,
  sugar_g      numeric,
  sodium_mg    numeric,
  fiber_g      numeric,
  use_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.user_foods is
  '사용자가 직접 만든 음식. 공용 foods 를 오염시키지 않도록 분리한다.';

create index user_foods_user_idx on public.user_foods (user_id, name);

create trigger user_foods_set_updated_at
  before update on public.user_foods
  for each row execute function public.set_updated_at();

alter table public.user_foods enable row level security;

create policy "본인 음식 조회" on public.user_foods for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "본인 음식 추가" on public.user_foods for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 음식 수정" on public.user_foods for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "본인 음식 삭제" on public.user_foods for delete
  to authenticated using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 3. 공공 API 결과 캐시
--
-- foods 는 인증 사용자에게 읽기만 열려 있다. 캐시 적재는 이 함수로만 한다.
--
-- ⚠️ 트레이드오프: 이 함수를 호출할 수 있는 사용자는 이론적으로 공용 캐시에
--    허위 영양정보를 넣을 수 있다. 호출 경로가 서버 액션 하나뿐이고 값이
--    공공 API 응답에서 오지만, RPC 를 직접 부르면 우회된다.
--    코드 접두사를 'MFDS:' 로 강제해 범위를 좁혀 두었고, 악용이 문제가 되면
--    캐시 적재를 service_role 전용으로 옮기면 된다.
-- -----------------------------------------------------------------------------

create or replace function public.cache_foods(items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  if jsonb_typeof(items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  insert into public.foods (
    code, name, brand, source, serving_size, serving_unit,
    kcal, carb_g, protein_g, fat_g, sugar_g, sodium_mg, fiber_g, search_text
  )
  select
    item ->> 'code',
    item ->> 'name',
    item ->> 'brand',
    'mfds',
    coalesce((item ->> 'servingSize')::numeric, 100),
    coalesce(item ->> 'servingUnit', 'g'),
    (item ->> 'kcal')::numeric,
    (item ->> 'carbG')::numeric,
    (item ->> 'proteinG')::numeric,
    (item ->> 'fatG')::numeric,
    (item ->> 'sugarG')::numeric,
    (item ->> 'sodiumMg')::numeric,
    (item ->> 'fiberG')::numeric,
    lower(coalesce(item ->> 'name', '') || ' ' || coalesce(item ->> 'brand', ''))
  from jsonb_array_elements(items) as item
  where item ->> 'code' like 'MFDS:%'
    and item ->> 'name' is not null
  on conflict (code) do update set
    name = excluded.name,
    brand = excluded.brand,
    kcal = excluded.kcal,
    carb_g = excluded.carb_g,
    protein_g = excluded.protein_g,
    fat_g = excluded.fat_g,
    sugar_g = excluded.sugar_g,
    sodium_mg = excluded.sodium_mg,
    fiber_g = excluded.fiber_g,
    search_text = excluded.search_text,
    updated_at = now();

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke execute on function public.cache_foods(jsonb) from public, anon;
grant execute on function public.cache_foods(jsonb) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 4. 식단 → 일 단위 영양 파생 지표
-- -----------------------------------------------------------------------------

create or replace function public.refresh_nutrition_metrics(p_user_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  zone       text := public.user_timezone(p_user_id);
  ref        uuid := public.daily_source_ref('nutrition', p_user_id, p_date);
  -- 하루의 대표 시각. 그래프에서 날짜별로 한 점씩 찍히면 되므로 정오로 고정한다.
  stamp      timestamptz := ((p_date + time '12:00') at time zone zone);
  totals     record;
  metric     record;
begin
  select
    sum(mi.kcal)      as kcal,
    sum(mi.carb_g)    as carb_g,
    sum(mi.protein_g) as protein_g,
    sum(mi.fat_g)     as fat_g
  into totals
  from public.meal_items mi
  join public.meals m on m.id = mi.meal_id
  where mi.user_id = p_user_id
    and (m.eaten_at at time zone zone)::date = p_date;

  for metric in
    select * from (values
      ('CALORIE_INTAKE', totals.kcal,      'kcal'),
      ('CARB_INTAKE',    totals.carb_g,    'g'),
      ('PROTEIN_INTAKE', totals.protein_g, 'g'),
      ('FAT_INTAKE',     totals.fat_g,     'g')
    ) as t(code, value, unit)
  loop
    if metric.value is null then
      -- 그 날 기록이 모두 지워졌으면 파생 행도 없애야 한다.
      delete from public.health_metrics
      where user_id = p_user_id and source = 'derived'
        and metric_code = metric.code and source_ref = ref;
    else
      insert into public.health_metrics
        (user_id, metric_code, value, unit, measured_at, source, source_ref)
      values
        (p_user_id, metric.code, round(metric.value, 1), metric.unit, stamp, 'derived', ref)
      on conflict (user_id, metric_code, source_ref)
        where source = 'derived' and source_ref is not null
      do update set value = excluded.value, measured_at = excluded.measured_at,
                    updated_at = now();
    end if;
  end loop;
end;
$$;


/** meal_items 변경 → 해당 끼니 날짜의 집계를 다시 계산 */
create or replace function public.on_meal_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data  record := coalesce(new, old);
  meal_date date;
  zone      text;
begin
  zone := public.user_timezone(row_data.user_id);

  select (m.eaten_at at time zone zone)::date into meal_date
  from public.meals m where m.id = row_data.meal_id;

  if meal_date is not null then
    perform public.refresh_nutrition_metrics(row_data.user_id, meal_date);
  end if;

  return row_data;
end;
$$;

create trigger meal_items_refresh_metrics
  after insert or update or delete on public.meal_items
  for each row execute function public.on_meal_item_change();


/** 끼니 시각이 바뀌면 옛 날짜와 새 날짜를 모두 다시 계산 */
create or replace function public.on_meal_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  zone text;
begin
  if tg_op = 'DELETE' then
    zone := public.user_timezone(old.user_id);
    perform public.refresh_nutrition_metrics(old.user_id, (old.eaten_at at time zone zone)::date);
    return old;
  end if;

  zone := public.user_timezone(new.user_id);
  perform public.refresh_nutrition_metrics(new.user_id, (new.eaten_at at time zone zone)::date);

  if tg_op = 'UPDATE' and old.eaten_at is distinct from new.eaten_at then
    perform public.refresh_nutrition_metrics(old.user_id, (old.eaten_at at time zone zone)::date);
  end if;

  return new;
end;
$$;

create trigger meals_refresh_metrics
  after insert or update or delete on public.meals
  for each row execute function public.on_meal_change();


-- -----------------------------------------------------------------------------
-- 5. 운동 → 일 단위 파생 지표
--
-- 소모 칼로리는 MET × 체중(kg) × 시간(h). 체중 기록이 없으면 추정하지 않는다.
-- 임의의 기본 체중을 쓰면 그럴듯하지만 틀린 숫자가 기록으로 남는다.
-- -----------------------------------------------------------------------------

create or replace function public.estimate_calories_burned(
  p_user_id uuid,
  p_met numeric,
  p_duration_min integer,
  p_at timestamptz
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_met is null or p_duration_min is null then null
    else (
      select round(p_met * hm.value * (p_duration_min / 60.0), 0)
      from public.health_metrics hm
      where hm.user_id = p_user_id
        and hm.metric_code = 'WEIGHT'
        and hm.measured_at <= p_at
      order by hm.measured_at desc
      limit 1
    )
  end;
$$;

comment on function public.estimate_calories_burned is
  'MET 기반 소모 칼로리 추정. 운동 시점 이전의 가장 최근 체중을 쓴다. '
  '체중 기록이 없으면 null — 임의 기본값으로 채우지 않는다.';


create or replace function public.refresh_exercise_metrics(p_user_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  zone   text := public.user_timezone(p_user_id);
  ref    uuid := public.daily_source_ref('exercise', p_user_id, p_date);
  stamp  timestamptz := ((p_date + time '12:00') at time zone zone);
  totals record;
  metric record;
begin
  select
    sum(w.duration_min)    as duration_min,
    sum(w.calories_burned) as calories
  into totals
  from public.workouts w
  where w.user_id = p_user_id
    and (w.started_at at time zone zone)::date = p_date;

  for metric in
    select * from (values
      ('EXERCISE_DURATION', totals.duration_min::numeric, 'min'),
      ('CALORIE_BURNED',    totals.calories,              'kcal')
    ) as t(code, value, unit)
  loop
    if metric.value is null then
      delete from public.health_metrics
      where user_id = p_user_id and source = 'derived'
        and metric_code = metric.code and source_ref = ref;
    else
      insert into public.health_metrics
        (user_id, metric_code, value, unit, measured_at, source, source_ref)
      values
        (p_user_id, metric.code, round(metric.value, 0), metric.unit, stamp, 'derived', ref)
      on conflict (user_id, metric_code, source_ref)
        where source = 'derived' and source_ref is not null
      do update set value = excluded.value, measured_at = excluded.measured_at,
                    updated_at = now();
    end if;
  end loop;
end;
$$;


/** 운동 저장 시 소모 칼로리를 채우고(비어 있으면) 집계를 갱신 */
create or replace function public.on_workout_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  zone text;
begin
  if tg_op = 'DELETE' then
    zone := public.user_timezone(old.user_id);
    perform public.refresh_exercise_metrics(old.user_id, (old.started_at at time zone zone)::date);
    return old;
  end if;

  zone := public.user_timezone(new.user_id);
  perform public.refresh_exercise_metrics(new.user_id, (new.started_at at time zone zone)::date);

  if tg_op = 'UPDATE' and old.started_at is distinct from new.started_at then
    perform public.refresh_exercise_metrics(old.user_id, (old.started_at at time zone zone)::date);
  end if;

  return new;
end;
$$;

create trigger workouts_refresh_metrics
  after insert or update or delete on public.workouts
  for each row execute function public.on_workout_change();


/** 소모 칼로리를 입력하지 않았으면 MET 로 추정해 채운다 */
create or replace function public.fill_workout_calories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  met numeric;
begin
  if new.calories_burned is not null or new.exercise_code is null then
    return new;
  end if;

  select e.met into met from public.exercises e where e.code = new.exercise_code;

  new.calories_burned := public.estimate_calories_burned(
    new.user_id, met, new.duration_min, new.started_at
  );

  return new;
end;
$$;

create trigger workouts_fill_calories
  before insert or update on public.workouts
  for each row execute function public.fill_workout_calories();


-- -----------------------------------------------------------------------------
-- 6. 주간 운동 목표
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column weekly_exercise_goal_min integer
    check (weekly_exercise_goal_min is null or weekly_exercise_goal_min between 0 and 10080);

comment on column public.profiles.weekly_exercise_goal_min is
  '주간 운동 목표(분). WHO 권고는 중강도 주 150분.';


-- -----------------------------------------------------------------------------
-- 7. 화면용 집계 조회
-- -----------------------------------------------------------------------------

create or replace function public.daily_nutrition_summary(target_date date)
returns table (
  kcal      numeric,
  carb_g    numeric,
  protein_g numeric,
  fat_g     numeric,
  meal_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select coalesce(p.timezone, 'Asia/Seoul') as tz
    from public.profiles p where p.id = (select auth.uid())
  )
  select
    coalesce(sum(mi.kcal), 0),
    coalesce(sum(mi.carb_g), 0),
    coalesce(sum(mi.protein_g), 0),
    coalesce(sum(mi.fat_g), 0),
    count(distinct m.id)::integer
  from public.meals m
  left join public.meal_items mi on mi.meal_id = m.id
  where m.user_id = (select auth.uid())
    and (m.eaten_at at time zone (select tz from zone))::date = target_date;
$$;


create or replace function public.weekly_exercise_summary()
returns table (
  total_min      integer,
  total_calories numeric,
  session_count  integer,
  goal_min       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select coalesce(p.timezone, 'Asia/Seoul') as tz, p.weekly_exercise_goal_min as goal
    from public.profiles p where p.id = (select auth.uid())
  )
  select
    coalesce(sum(w.duration_min), 0)::integer,
    coalesce(sum(w.calories_burned), 0),
    count(*)::integer,
    (select goal from zone)
  from public.workouts w
  where w.user_id = (select auth.uid())
    -- 최근 7일. 주 시작 요일 관습이 나라마다 달라 롤링 윈도로 잡는다.
    and (w.started_at at time zone (select tz from zone))::date
        > (now() at time zone (select tz from zone))::date - 7;
$$;


-- -----------------------------------------------------------------------------
-- 8. 내부 헬퍼 함수의 실행 권한 회수
--
-- 이 함수들은 security definer 이면서 user_id 를 인자로 받는다. 기본값대로
-- 두면 인증 사용자가 남의 user_id 를 넣어 호출할 수 있다.
--
-- 특히 estimate_calories_burned 는 다른 사용자의 체중에서 계산한 값을
-- 돌려주므로, MET·시간을 알고 있으면 체중을 역산할 수 있다 — 실제 유출이다.
--
-- 트리거는 소유자 권한으로 실행되므로 여기서 회수해도 동작에 영향이 없다.
-- -----------------------------------------------------------------------------

revoke execute on function public.user_timezone(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_nutrition_metrics(uuid, date) from public, anon, authenticated;
revoke execute on function public.refresh_exercise_metrics(uuid, date) from public, anon, authenticated;
revoke execute on function public.estimate_calories_burned(uuid, numeric, integer, timestamptz)
  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 9. 운동 마스터 — MET 값
--
-- 출처: Compendium of Physical Activities (Ainsworth et al.)
-- MET 1 = 안정 시 대사량. 소모 칼로리 = MET × 체중(kg) × 시간(h)
-- -----------------------------------------------------------------------------

insert into public.exercises (code, name, category, met) values
  ('WALK_SLOW',      '걷기 (천천히)',       'cardio',      2.8),
  ('WALK',           '걷기 (보통)',         'cardio',      3.5),
  ('WALK_FAST',      '빠르게 걷기',         'cardio',      4.3),
  ('RUN_8',          '달리기 (8km/h)',      'cardio',      8.3),
  ('RUN_10',         '달리기 (10km/h)',     'cardio',      9.8),
  ('RUN_12',         '달리기 (12km/h)',     'cardio',     11.8),
  ('CYCLING',        '자전거 (여가)',       'cardio',      6.8),
  ('CYCLING_FAST',   '자전거 (빠르게)',     'cardio',     10.0),
  ('SWIM',           '수영 (자유형)',       'cardio',      8.3),
  ('HIKING',         '등산',                'cardio',      6.5),
  ('STAIRS',         '계단 오르기',         'cardio',      8.8),
  ('JUMP_ROPE',      '줄넘기',              'cardio',     12.3),
  ('ELLIPTICAL',     '일립티컬',            'cardio',      5.0),
  ('ROWING',         '로잉머신',            'cardio',      7.0),
  ('WEIGHT_LIGHT',   '웨이트 (가볍게)',     'strength',    3.5),
  ('WEIGHT_HEAVY',   '웨이트 (고강도)',     'strength',    6.0),
  ('BODYWEIGHT',     '맨몸운동 · 홈트',     'strength',    3.8),
  ('CROSSFIT',       '크로스핏',            'strength',    8.0),
  ('CLIMBING',       '클라이밍',            'strength',    8.0),
  ('YOGA',           '요가',                'flexibility', 2.5),
  ('PILATES',        '필라테스',            'flexibility', 3.0),
  ('STRETCHING',     '스트레칭',            'flexibility', 2.3),
  ('SOCCER',         '축구',                'sports',      7.0),
  ('BASKETBALL',     '농구',                'sports',      6.5),
  ('BADMINTON',      '배드민턴',            'sports',      5.5),
  ('TENNIS',         '테니스',              'sports',      7.3),
  ('TABLE_TENNIS',   '탁구',                'sports',      4.0),
  ('GOLF',           '골프 (걸어서)',       'sports',      4.8),
  ('BOWLING',        '볼링',                'sports',      3.0),
  ('DANCE',          '댄스',                'sports',      5.0)
on conflict (code) do nothing;
