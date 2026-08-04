-- =============================================================================
-- 0006_medication_reminders.sql
-- 복약 알림 발송 대상 조회
--
-- 발송기는 사용자 세션이 아니라 스케줄러로 도는 서버 프로세스이므로
-- auth.uid() 를 쓸 수 없다. security definer 로 전체 사용자를 훑되,
-- 실행 권한을 service_role 로만 제한한다.
-- =============================================================================

create or replace function public.due_medication_reminders(window_minutes integer default 10)
returns table (
  subscription_id uuid,
  user_id         uuid,
  endpoint        text,
  p256dh          text,
  auth_key        text,
  medication_id   uuid,
  medication_name text,
  dosage_amount   numeric,
  dosage_unit     text,
  schedule_id     uuid,
  scheduled_for   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with due as (
    select
      m.id   as medication_id,
      m.name as medication_name,
      m.dosage_amount,
      m.dosage_unit,
      s.id      as schedule_id,
      s.user_id,
      -- 사용자 타임존의 "오늘" 기준으로 예정 시각을 만든다.
      (((now() at time zone coalesce(p.timezone, 'Asia/Seoul'))::date + s.time_of_day)
        at time zone coalesce(p.timezone, 'Asia/Seoul')) as scheduled_for,
      s.days_of_week
    from public.medication_schedules s
    join public.medications m on m.id = s.medication_id
    join public.profiles p on p.id = s.user_id
    where s.reminder_enabled
      and m.is_active
  ),
  pending as (
    select d.*
    from due d
    where
      -- 예정 시각이 방금 지났고 아직 창 안에 있다
      d.scheduled_for <= now()
      and d.scheduled_for > now() - make_interval(mins => window_minutes)
      -- 사용자 타임존 기준 요일이 스케줄에 포함된다
      and extract(dow from d.scheduled_for)::smallint = any (d.days_of_week)
      -- 이미 복용/건너뜀을 기록했으면 알리지 않는다
      and not exists (
        select 1 from public.medication_logs l
        where l.schedule_id = d.schedule_id
          and l.scheduled_for = d.scheduled_for
      )
  )
  select
    ps.id, ps.user_id, ps.endpoint, ps.p256dh, ps.auth_key,
    p.medication_id, p.medication_name, p.dosage_amount, p.dosage_unit,
    p.schedule_id, p.scheduled_for
  from pending p
  join public.push_subscriptions ps on ps.user_id = p.user_id
  -- 연속 실패한 구독은 만료된 것으로 보고 건너뛴다
  where ps.failure_count < 5;
$$;

comment on function public.due_medication_reminders is
  '지금 알려야 할 복약 + 대상 푸시 구독. 스케줄러(service_role)만 호출한다.';

-- security definer 함수는 기본적으로 public 에게 실행 권한이 열리므로 회수한다.
revoke execute on function public.due_medication_reminders(integer) from public, anon, authenticated;
grant execute on function public.due_medication_reminders(integer) to service_role;


-- -----------------------------------------------------------------------------
-- 발송 실패 카운터
--
-- 브라우저가 410 Gone 을 주면 구독이 만료된 것이다. 즉시 지우면 일시적
-- 네트워크 오류와 구분이 안 되므로 카운터를 올리고, 누적되면 제외한다.
-- -----------------------------------------------------------------------------

create or replace function public.mark_push_failure(subscription_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set failure_count = failure_count + 1
  where endpoint = subscription_endpoint;
$$;

create or replace function public.mark_push_success(subscription_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_subscriptions
  set failure_count = 0, last_used_at = now()
  where endpoint = subscription_endpoint;
$$;

revoke execute on function public.mark_push_failure(text) from public, anon, authenticated;
revoke execute on function public.mark_push_success(text) from public, anon, authenticated;
grant execute on function public.mark_push_failure(text) to service_role;
grant execute on function public.mark_push_success(text) to service_role;


-- =============================================================================
-- 스케줄러 설정 (수동 적용 필요)
--
-- 아래는 배포한 프로젝트의 URL 과 CRON_SECRET 이 있어야 실행할 수 있으므로
-- 마이그레이션에 넣지 않고 주석으로 남긴다. Supabase 대시보드의 SQL Editor 에서
-- 값을 채워 한 번 실행하면 된다.
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule(
--     'medication-reminders',
--     '*/5 * * * *',            -- 5분마다. due_medication_reminders 의 창도 맞출 것
--     $$
--     select net.http_post(
--       url     := 'https://<앱 도메인>/api/push/dispatch',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <CRON_SECRET>'
--       ),
--       body    := '{}'::jsonb
--     );
--     $$
--   );
--
-- 창(window_minutes)이 cron 주기보다 짧으면 알림이 새고, 훨씬 길면 중복 발송된다.
-- 기본값 10분 / 5분 주기는 한 번 놓쳐도 다음 주기에 따라잡히는 조합이다.
-- =============================================================================
