-- =============================================================================
-- 0004_consent_functions.sql
-- 동의 문서 발행 + 필수 동의 여부 판정
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 필수 동의 완료 여부
--
-- proxy 가 매 요청마다 호출하므로 가볍게 유지한다.
-- "현재 유효한 필수 문서 중, 사용자가 동의하지 않은 게 하나도 없다"를 판정.
--
-- 문서가 새 버전으로 갱신되면 이전 버전 동의는 자동으로 무효가 되어
-- 재동의 화면이 뜬다 — 법적으로 요구되는 동작이다.
-- -----------------------------------------------------------------------------

create or replace function public.has_required_consents()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select not exists (
    select 1
    from public.consent_documents d
    where d.is_required
      and d.retired_at is null
      and d.effective_from <= now()
      and not exists (
        select 1
        from public.user_consents c
        where c.consent_document_id = d.id
          and c.user_id = (select auth.uid())
          and c.granted
          and c.revoked_at is null
      )
  );
$$;

comment on function public.has_required_consents is
  '필수 동의를 모두 마쳤는지. proxy 의 동의 게이트가 사용한다.';


-- -----------------------------------------------------------------------------
-- 현재 유효한 동의 문서 목록
--
-- 종류별로 가장 최근에 발효된 문서 하나씩, 사용자의 동의 여부와 함께 반환한다.
-- -----------------------------------------------------------------------------

create or replace function public.current_consent_documents()
returns table (
  id          uuid,
  kind        public.consent_kind,
  version     text,
  title       text,
  body        text,
  is_required boolean,
  granted     boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (d.kind)
    d.id,
    d.kind,
    d.version,
    d.title,
    d.body,
    d.is_required,
    coalesce(
      (
        select c.granted
        from public.user_consents c
        where c.consent_document_id = d.id
          and c.user_id = (select auth.uid())
          and c.revoked_at is null
        order by c.granted_at desc
        limit 1
      ),
      false
    ) as granted
  from public.consent_documents d
  where d.retired_at is null
    and d.effective_from <= now()
  order by d.kind, d.effective_from desc;
$$;


-- =============================================================================
-- 동의 문서 v1
--
-- ⚠️ 아래 본문은 개발용 초안이다. 실제 서비스 오픈 전 법률 검토를 거쳐
--    정식 문안으로 교체하고 version 을 올려야 한다. (docs/PLAN.md §7)
-- =============================================================================

insert into public.consent_documents (kind, version, title, body, is_required)
values
  (
    'terms_of_service',
    '1.0-draft',
    '서비스 이용약관',
    E'본 서비스는 사용자가 스스로 기록한 건강 데이터를 정리해 보여주는 '
    '개인 건강 기록 도구입니다.\n\n'
    '본 서비스는 의료기기가 아니며 의학적 진단·치료·처방을 제공하지 않습니다. '
    '표시되는 모든 수치와 참고범위는 참고용이며, 건강상 판단이 필요한 경우 '
    '반드시 의료진과 상담하시기 바랍니다.',
    true
  ),
  (
    'privacy_policy',
    '1.0-draft',
    '개인정보 처리방침',
    E'수집 항목\n'
    '- 계정 정보: 이메일, 표시 이름\n'
    '- 프로필: 출생연도, 성별, 키 (정상범위 판정에만 사용)\n'
    '- 건강 기록: 사용자가 직접 입력하거나 업로드한 데이터\n\n'
    '주민등록번호 등 고유식별정보는 수집하지 않습니다.\n\n'
    '보유 기간\n'
    '- 회원 탈퇴 즉시 모든 개인정보와 업로드 파일을 파기합니다.\n\n'
    '이용자는 언제든지 본인 데이터의 열람·정정·삭제를 요청할 수 있습니다.',
    true
  ),
  (
    'sensitive_health_data',
    '1.0-draft',
    '민감정보(건강정보) 수집·이용 동의',
    E'개인정보보호법 제23조에 따라 건강에 관한 정보는 민감정보로 분류되며, '
    '수집·이용에 별도의 동의가 필요합니다.\n\n'
    '수집 항목\n'
    '- 신체 측정값 (체중, 체지방률, 혈압, 혈당 등)\n'
    '- 수면·식단·운동 기록\n'
    '- 복약 정보\n'
    '- 건강검진 결과 및 결과지 파일\n\n'
    '이용 목적\n'
    '- 사용자 본인에게 건강 기록을 정리하여 제공\n'
    '- 지표 추세 및 통계 산출\n\n'
    '위 목적 외로 이용하거나 제3자에게 제공하지 않습니다.\n\n'
    '동의를 거부할 권리가 있으나, 동의하지 않을 경우 서비스의 핵심 기능을 '
    '이용할 수 없습니다.',
    true
  ),
  (
    'llm_processing',
    '1.0-draft',
    '건강검진 결과지 자동 판독을 위한 처리 위탁 동의',
    E'건강검진 결과지 자동 판독 기능을 이용하는 경우, 업로드하신 결과지 '
    '파일이 판독을 위해 외부 AI 처리 업체(Anthropic PBC)로 전송됩니다.\n\n'
    '- 전송 항목: 업로드한 검진 결과지 파일(PDF 또는 이미지)\n'
    '- 처리 목적: 결과지에 기재된 검사 항목과 수치의 자동 추출\n'
    '- 수탁자: Anthropic PBC (미국)\n'
    '- 보유 기간: 처리 완료 후 즉시 파기 (모델 학습에 이용되지 않음)\n\n'
    '추출된 수치는 반드시 사용자가 원본과 대조하여 확인한 뒤에만 기록에 '
    '반영됩니다. 자동으로 저장되지 않습니다.\n\n'
    '이 동의를 거부하셔도 검진 결과를 직접 입력하는 방식으로 서비스를 '
    '이용하실 수 있습니다. 따라서 선택 동의 항목입니다.',
    false
  ),
  (
    'marketing',
    '1.0-draft',
    '마케팅 정보 수신 (선택)',
    E'서비스 개선 소식, 새로운 기능 안내 등을 이메일로 받아보실 수 있습니다.\n\n'
    '동의하지 않으셔도 서비스 이용에 제한이 없으며, 언제든지 설정에서 '
    '변경하실 수 있습니다.',
    false
  )
on conflict (kind, version) do nothing;
