-- =============================================================================
-- 확정된 약관 게시용 스크립트
--
-- ⚠️ 이 파일은 supabase/migrations/ 에 있지 않으므로 자동 적용되지 않습니다.
--    법률 검토가 끝나고 OPERATOR_FIELDS.md 의 {{ }} 를 모두 채운 뒤,
--    supabase/migrations/0010_consent_documents_v1.sql 로 옮겨서 적용하십시오.
--
-- 게시하면 어떻게 되는가
--   has_required_consents() 는 "retired 되지 않은 모든 필수 문서에 동의했는가"를
--   봅니다. 따라서 새 버전을 넣기만 하고 옛 버전을 내리지 않으면, 이용자에게
--   같은 문서가 두 개 뜹니다. 아래 순서를 지키십시오.
--
--     1. 옛 버전 retire  → 판정 대상에서 빠짐
--     2. 새 버전 insert  → 판정 대상에 들어옴
--     3. 결과적으로 기존 이용자는 다음 접속 시 재동의 화면으로 이동
--
--   본문은 docs/legal/*.md 에서 옮겨 오되, 마크다운 표기(#, |, **)는 화면에
--   그대로 노출되므로 평문으로 정리해서 넣으십시오. 본문은 HTML 로 렌더링되지
--   않습니다 (문서 편집이 XSS 통로가 되지 않도록 의도한 것입니다).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. 검토 전 초안을 내린다
-- -----------------------------------------------------------------------------

update public.consent_documents
set retired_at = now()
where version = '1.0-draft'
  and retired_at is null;

-- -----------------------------------------------------------------------------
-- 2. 확정본을 올린다
--
-- is_required 는 신중히. 필수로 올리면 전 이용자가 즉시 재동의 대상이 됩니다.
--   terms_of_service       필수
--   privacy_policy         필수
--   sensitive_health_data  필수 (법정 별도 동의)
--   llm_processing         선택 — 거부해도 수동 입력으로 이용 가능
--   marketing              선택
-- -----------------------------------------------------------------------------

insert into public.consent_documents (kind, version, title, body, is_required)
values
  (
    'terms_of_service',
    '1.0',
    '서비스 이용약관',
    E'여기에 docs/legal/01-terms-of-service.md 의 확정 본문을 평문으로 넣으십시오.',
    true
  ),
  (
    'privacy_policy',
    '1.0',
    '개인정보 처리방침',
    E'여기에 docs/legal/02-privacy-policy.md 의 확정 본문을 평문으로 넣으십시오.',
    true
  ),
  (
    'sensitive_health_data',
    '1.0',
    '민감정보(건강정보) 수집·이용 동의',
    E'여기에 docs/legal/03-sensitive-health-data.md 의 확정 본문을 평문으로 넣으십시오.',
    true
  ),
  (
    'llm_processing',
    '1.0',
    '검진 결과지 자동 판독을 위한 처리 위탁 및 국외 이전 동의',
    E'여기에 docs/legal/04-llm-processing.md 의 확정 본문을 평문으로 넣으십시오.',
    false
  ),
  (
    'marketing',
    '1.0',
    '마케팅 정보 수신 (선택)',
    E'여기에 docs/legal/05-marketing.md 의 확정 본문을 평문으로 넣으십시오.',
    false
  );

-- -----------------------------------------------------------------------------
-- 3. 확인
--
-- 필수 문서가 정확히 3건, 선택이 2건, 그리고 모두 1.0 이어야 합니다.
-- -----------------------------------------------------------------------------

do $$
declare
  active_required integer;
  active_optional integer;
  stale           integer;
begin
  select count(*) filter (where is_required),
         count(*) filter (where not is_required)
  into active_required, active_optional
  from public.consent_documents
  where retired_at is null;

  select count(*) into stale
  from public.consent_documents
  where retired_at is null and version <> '1.0';

  if active_required <> 3 or active_optional <> 2 then
    raise exception '게시 후 활성 문서 수가 예상과 다릅니다 (필수 %, 선택 %)',
      active_required, active_optional;
  end if;

  if stale > 0 then
    raise exception '내려야 할 옛 버전이 %건 남아 있습니다', stale;
  end if;

  raise notice '게시 완료. 기존 이용자는 다음 접속 시 재동의 화면으로 이동합니다.';
end $$;

commit;
