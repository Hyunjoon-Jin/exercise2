-- =============================================================================
-- 0010_notification_privacy.sql
-- 복약 알림에서 약 이름을 숨길 수 있게 한다
--
-- 왜 필요한가
--   알림 페이로드는 RFC 8291 로 종단간 암호화되므로 푸시 서비스 사업자는
--   내용을 읽지 못한다. 그런데 기기 잠금화면에는 그대로 표시된다 —
--   "메트포르민 500mg" 이 뜨면 옆 사람이 당뇨를 안다. 복용 중인 약은
--   질병을 직접 추론하게 하는 정보다.
--
-- 기본값을 숨김으로 두는 이유
--   알림을 켜는 것과 잠금화면에 약 이름이 뜨는 것에 함께 동의했다고 볼 수
--   없다. 이름이 보이길 원하는 사람은 켜면 되지만, 원하지 않았던 사람이
--   이미 노출된 뒤에 끄는 것은 되돌릴 수 없다.
-- =============================================================================

alter table public.profiles
  add column show_medication_name_in_push boolean not null default false;

comment on column public.profiles.show_medication_name_in_push is
  '알림 본문에 약 이름을 넣을지. 기본 false — 잠금화면 노출은 되돌릴 수 없다.';


-- -----------------------------------------------------------------------------
-- 발송 대상 조회에 이 설정을 함께 실어 보낸다.
--
-- 발송 코드가 프로필을 따로 읽게 하면 알림 한 건마다 쿼리가 하나 더 붙고,
-- 무엇보다 그 조회를 빠뜨리면 조용히 이름이 나간다. 대상 조회에 포함시켜
-- 빠뜨릴 수 없게 만든다.
--
-- ⚠️ 본문은 0006 의 것을 그대로 옮겼다. 판정 조건(예정 시각이 방금 지났고
--    아직 창 안, 요일 일치, 미기록)은 한 글자도 바꾸지 않았다 — 알림 누락이나
--    중복 발송은 사용자가 약을 거르거나 두 번 먹는 결과로 이어진다.
--    바뀐 것은 show_medication_name 컬럼 하나뿐이다.
-- -----------------------------------------------------------------------------

drop function if exists public.due_medication_reminders(integer);

create or replace function public.due_medication_reminders(window_minutes integer default 10)
returns table (
  subscription_id      uuid,
  user_id              uuid,
  endpoint             text,
  p256dh               text,
  auth_key             text,
  medication_id        uuid,
  medication_name      text,
  dosage_amount        numeric,
  dosage_unit          text,
  schedule_id          uuid,
  scheduled_for        timestamptz,
  show_medication_name boolean
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
      s.days_of_week,
      p.show_medication_name_in_push as show_medication_name
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
    p.schedule_id, p.scheduled_for, p.show_medication_name
  from pending p
  join public.push_subscriptions ps on ps.user_id = p.user_id
  -- 연속 실패한 구독은 만료된 것으로 보고 건너뛴다
  where ps.failure_count < 5;
$$;

comment on function public.due_medication_reminders is
  '발송 대상 조회. 스케줄러 전용 — 사용자 세션에는 실행 권한이 없다. '
  '약 이름 노출 여부를 함께 실어 보내 발송 코드가 빠뜨릴 수 없게 한다.';

-- 재생성했으므로 권한을 다시 잠근다. drop 하면 이전 revoke/grant 가 함께 사라진다.
revoke execute on function public.due_medication_reminders(integer) from public, anon, authenticated;
grant execute on function public.due_medication_reminders(integer) to service_role;
