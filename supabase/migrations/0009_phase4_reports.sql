-- =============================================================================
-- 0009_phase4_reports.sql
-- Phase 4 — 대시보드·주간 리포트
--
-- 리포트 한 장에 필요한 집계는 수면·식단·운동·복약·체중에 걸쳐 있다.
-- 화면에서 다섯 번 왕복하는 대신 함수 하나로 한 주를 뽑는다.
--
-- 여기 함수들은 전부 security invoker 다. RLS 가 그대로 걸리므로 남의 주간
-- 요약이 나올 수 없고, user_id 를 받는 인자도 두지 않는다 — Phase 2 에서
-- 그 형태가 몸무게 역산 통로가 됐던 전례가 있다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 주간 리포트
--
-- p_week_offset: 0 = 이번 주, 1 = 지난주, …
-- 주의 시작은 월요일(date_trunc('week')). 사용자 타임존 기준이라
-- 한국 사용자가 일요일 밤에 봐도 그 주가 아직 끝나지 않은 것으로 나온다.
-- -----------------------------------------------------------------------------

create or replace function public.weekly_report(p_week_offset integer default 0)
returns table (
  period_start      date,
  period_end        date,
  sleep_avg_min     numeric,
  sleep_nights      integer,
  kcal_avg          numeric,
  kcal_days         integer,
  exercise_min      integer,
  exercise_sessions integer,
  exercise_goal_min integer,
  doses_total       integer,
  doses_taken       integer,
  adherence         numeric,
  weight_avg        numeric,
  weight_count      integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid         uuid := (select auth.uid());
  zone        text;
  goal        integer;
  wk_start    date;
  wk_end      date;
  -- 복약은 아직 오지 않은 시각을 "안 먹었다"로 셀 수 없다. 어제까지만 센다.
  dose_end    date;
  range_start timestamptz;
  range_end   timestamptz;
begin
  if uid is null then
    return;
  end if;

  select coalesce(p.timezone, 'Asia/Seoul'), p.weekly_exercise_goal_min
  into zone, goal
  from public.profiles p
  where p.id = uid;

  zone := coalesce(zone, 'Asia/Seoul');

  wk_start := (date_trunc('week', (now() at time zone zone))
                 - make_interval(weeks => greatest(p_week_offset, 0)))::date;
  wk_end   := wk_start + 6;
  dose_end := least(wk_end, ((now() at time zone zone)::date - 1));

  range_start := wk_start::timestamp at time zone zone;
  range_end   := (wk_end + 1)::timestamp at time zone zone;

  return query
  with sleep as (
    select avg(s.duration_min)::numeric as avg_min, count(*)::integer as nights
    from public.sleep_records s
    where s.sleep_date between wk_start and wk_end
      and s.duration_min is not null
  ),
  -- 하루 섭취 칼로리는 이미 파생 지표로 쌓여 있다 (0007). 끼니를 다시
  -- 합산하지 않고 그걸 읽는다 — 같은 숫자가 두 곳에서 계산되면 갈라진다.
  nutrition as (
    select avg(h.value)::numeric as avg_kcal, count(*)::integer as days
    from public.health_metrics h
    where h.metric_code = 'CALORIE_INTAKE'
      and h.source = 'derived'
      and h.measured_at >= range_start
      and h.measured_at < range_end
  ),
  exercise as (
    select coalesce(sum(w.duration_min), 0)::integer as total_min,
           count(*)::integer as sessions
    from public.workouts w
    where w.started_at >= range_start
      and w.started_at < range_end
  ),
  -- 예정 복용은 현재 스케줄을 그 주에 되짚어 전개한 값이다. 그 사이
  -- 스케줄을 바꿨다면 지난주 수치는 근사치가 된다.
  doses as (
    select
      count(*)::integer as total,
      count(*) filter (where d.status = 'taken')::integer as taken
    from generate_series(wk_start, dose_end, interval '1 day') as g(day)
    cross join lateral public.medication_doses_for_date(g.day::date) as d
    where dose_end >= wk_start
  ),
  weight as (
    select avg(h.value)::numeric as avg_kg, count(*)::integer as samples
    from public.health_metrics h
    where h.metric_code = 'WEIGHT'
      and h.measured_at >= range_start
      and h.measured_at < range_end
  )
  select
    wk_start,
    wk_end,
    round(sleep.avg_min, 0),
    sleep.nights,
    round(nutrition.avg_kcal, 0),
    nutrition.days,
    exercise.total_min,
    exercise.sessions,
    goal,
    doses.total,
    doses.taken,
    case when doses.total = 0 then null
         else round(100.0 * doses.taken / doses.total, 0) end,
    round(weight.avg_kg, 1),
    weight.samples
  from sleep, nutrition, exercise, doses, weight;
end;
$$;

comment on function public.weekly_report is
  '한 주치 요약을 한 행으로. p_week_offset 0=이번 주, 1=지난주. '
  '복약 예정 건수는 어제까지만 센다 — 아직 오지 않은 복용은 놓친 것이 아니다.';


-- -----------------------------------------------------------------------------
-- 2. 기간별 지표 변화
--
-- 리포트에서 "이번 주 체중 -0.4kg" 같은 문장을 만들려면 지표마다
-- 첫값·끝값·최소·최대가 필요하다. PostgREST 로는 지표 수만큼 왕복해야 한다.
-- -----------------------------------------------------------------------------

create or replace function public.metric_period_summary(p_start date, p_end date)
returns table (
  metric_code  text,
  first_value  numeric,
  last_value   numeric,
  min_value    numeric,
  max_value    numeric,
  sample_count integer,
  last_at      timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select coalesce(p.timezone, 'Asia/Seoul') as tz
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  bounds as (
    select p_start::timestamp at time zone tz as lo,
           (p_end + 1)::timestamp at time zone tz as hi
    from zone
  ),
  rows as (
    select h.metric_code, h.value, h.measured_at
    from public.health_metrics h, bounds
    where h.measured_at >= bounds.lo
      and h.measured_at < bounds.hi
  )
  select
    r.metric_code,
    -- first/last 는 시각 순. min/max 는 값 순. 둘을 섞으면 "최저 체중"과
    -- "마지막 체중"이 같은 숫자로 보이는 버그가 된다.
    (array_agg(r.value order by r.measured_at asc))[1],
    (array_agg(r.value order by r.measured_at desc))[1],
    min(r.value),
    max(r.value),
    count(*)::integer,
    max(r.measured_at)
  from rows r
  group by r.metric_code;
$$;


-- -----------------------------------------------------------------------------
-- 3. 검수 대기 중인 검진 건수
--
-- 홈에서 "판독은 끝났는데 아직 확인 안 한 결과지가 있다"를 알리기 위한 값.
-- 이 알림이 없으면 업로드해 놓고 확정을 잊은 결과지가 조용히 묻힌다.
-- -----------------------------------------------------------------------------

create or replace function public.pending_checkup_reviews()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.checkup_extractions e
  where e.status = 'review';
$$;
