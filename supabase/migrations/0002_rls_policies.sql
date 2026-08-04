-- =============================================================================
-- 0002_rls_policies.sql
-- Row Level Security — 사용자 간 데이터 격리
--
-- 원칙
--   1. 사용자 데이터 테이블은 예외 없이 RLS 를 켠다. 정책이 없으면 접근 불가가
--      기본값이므로, 테이블을 추가하고 정책을 잊으면 "새는" 게 아니라 "막힌다".
--   2. 격리 조건은 (select auth.uid()) = user_id 로 통일한다.
--      auth.uid() 를 서브쿼리로 감싸면 PG 가 행마다 재평가하지 않고 한 번만
--      평가하므로 대량 조회에서 실행계획이 크게 개선된다.
--   3. 마스터 테이블(metric_definitions, foods, exercises, consent_documents)은
--      개인정보가 아니므로 인증 사용자 전체에 읽기를 허용하고 쓰기는 막는다.
--      쓰기는 service_role(마이그레이션·배치)만 수행한다.
--   4. 동의 이력(user_consents)은 INSERT 만 허용한다 — 감사 추적 보존.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 프로필
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy "본인 프로필 조회"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "본인 프로필 수정"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- INSERT 정책은 두지 않는다. 프로필은 handle_new_user() 트리거(security definer)가
-- 가입 시 자동 생성하므로 클라이언트가 직접 만들 일이 없다.
-- DELETE 정책도 두지 않는다. 탈퇴는 auth.users 삭제 → cascade 로 처리한다.


-- -----------------------------------------------------------------------------
-- 2. 동의
-- -----------------------------------------------------------------------------

alter table public.consent_documents enable row level security;

create policy "동의 문서는 누구나 조회"
  on public.consent_documents for select
  to authenticated, anon
  using (true);

-- 가입 전(anon)에도 약관을 보여줘야 하므로 anon 에도 읽기를 허용한다.
-- 쓰기 정책 없음 → service_role 만 발행 가능.


alter table public.user_consents enable row level security;

create policy "본인 동의 이력 조회"
  on public.user_consents for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 동의 기록"
  on public.user_consents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- UPDATE/DELETE 정책 없음 → 동의 이력은 수정·삭제 불가.
-- 철회는 revoked_at 을 채우는 게 아니라 granted=false 행을 새로 INSERT 한다.


-- -----------------------------------------------------------------------------
-- 3. 지표 마스터 — 공개 읽기 전용
-- -----------------------------------------------------------------------------

alter table public.metric_definitions enable row level security;

create policy "지표 정의 조회"
  on public.metric_definitions for select
  to authenticated
  using (true);


alter table public.metric_reference_ranges enable row level security;

create policy "정상범위 조회"
  on public.metric_reference_ranges for select
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- 4. health_metrics — 가장 중요한 격리 대상
-- -----------------------------------------------------------------------------

alter table public.health_metrics enable row level security;

create policy "본인 지표 조회"
  on public.health_metrics for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "본인 지표 추가"
  on public.health_metrics for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "본인 지표 수정"
  on public.health_metrics for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "본인 지표 삭제"
  on public.health_metrics for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- -----------------------------------------------------------------------------
-- 5. 수면 · 복약 · 식단 · 운동 · 검진
--    패턴이 동일하므로 DO 블록으로 일괄 생성한다.
--    (SELECT/INSERT/UPDATE/DELETE 전부 본인 행만)
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
  owned_tables text[] := array[
    'sleep_records',
    'medications',
    'medication_schedules',
    'medication_logs',
    'meals',
    'meal_items',
    'workouts',
    'workout_sets',
    'checkups',
    'checkup_documents',
    'checkup_extractions',
    'checkup_extraction_items'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy "본인 행 조회" on public.%I for select
      to authenticated using ((select auth.uid()) = user_id)
    $f$, t);

    execute format($f$
      create policy "본인 행 추가" on public.%I for insert
      to authenticated with check ((select auth.uid()) = user_id)
    $f$, t);

    execute format($f$
      create policy "본인 행 수정" on public.%I for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $f$, t);

    execute format($f$
      create policy "본인 행 삭제" on public.%I for delete
      to authenticated using ((select auth.uid()) = user_id)
    $f$, t);
  end loop;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. 음식 · 운동 마스터 — 공개 읽기
-- -----------------------------------------------------------------------------

alter table public.foods enable row level security;

create policy "음식 마스터 조회"
  on public.foods for select
  to authenticated
  using (true);

-- 사용자 정의 음식(CUSTOM:*)도 허용하려면 별도 user_foods 테이블을 두는 편이
-- 안전하다. 공용 마스터에 사용자 쓰기를 열면 다른 사용자에게 노출되므로
-- Phase 2 에서 별도 설계한다.


alter table public.exercises enable row level security;

create policy "운동 마스터 조회"
  on public.exercises for select
  to authenticated
  using (true);


-- -----------------------------------------------------------------------------
-- 7. 검진 파일 Storage 버킷
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'checkup-documents',
  'checkup-documents',
  false,                                -- 비공개. signed URL 로만 접근.
  33554432,                             -- 32MB — Claude API 요청 상한과 정렬
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- 경로 규칙: {user_id}/{checkup_id}/{filename}
-- 첫 세그먼트가 본인 uid 인 객체만 접근 가능하게 한다.

create policy "본인 검진파일 조회"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'checkup-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "본인 검진파일 업로드"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'checkup-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "본인 검진파일 삭제"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'checkup-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- -----------------------------------------------------------------------------
-- 8. 회원 탈퇴 — 즉시 파기
-- -----------------------------------------------------------------------------

-- auth.users 삭제 시 모든 사용자 테이블은 on delete cascade 로 함께 삭제된다.
-- 단 Storage 객체는 cascade 대상이 아니므로 애플리케이션에서 명시적으로 지운다.
-- (src/lib/account/delete-account.ts 참고)

comment on schema public is
  '건강정보는 개인정보보호법상 민감정보다. 새 테이블을 추가할 때는 '
  'user_id + RLS 를 반드시 함께 넣을 것.';
