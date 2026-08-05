-- =============================================================================
-- 0008_phase3_checkup_review.sql
-- Phase 3 — 건강검진 결과지 자동 판독의 확정 절차
--
-- 추출 자체는 애플리케이션에서 하고(외부 API 호출), DB 는 "확정" 경계만 맡는다.
--
-- 핵심 원칙 (docs/PLAN.md §6)
--   자동 저장 금지. checkup_extraction_items 에 원본을 보존하고,
--   사용자가 accepted/edited 로 표시한 항목만 health_metrics 로 승격한다.
--   승격은 여기 함수를 통해서만 일어난다 — 클라이언트가 health_metrics 에
--   직접 쓰면 검수를 우회할 수 있다.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 확정 — 검수한 항목을 지표로 승격
--
-- security invoker 라 RLS 가 그대로 적용된다. 남의 추출을 확정하려 하면
-- 조회 단계에서 0건이 되어 아무 일도 일어나지 않는다.
-- -----------------------------------------------------------------------------

create or replace function public.confirm_checkup_extraction(p_extraction_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  promoted   integer := 0;
  item       record;
  measured   timestamptz;
  new_id     uuid;
begin
  -- 측정 시각은 검진일. 시각 정보가 없으므로 정오로 둔다.
  select (c.checkup_date + time '12:00')
           at time zone coalesce(p.timezone, 'Asia/Seoul')
  into measured
  from public.checkup_extractions e
  join public.checkups c on c.id = e.checkup_id
  join public.profiles p on p.id = e.user_id
  where e.id = p_extraction_id;

  if measured is null then
    -- RLS 로 걸러졌거나 존재하지 않는 추출.
    return 0;
  end if;

  for item in
    select i.*
    from public.checkup_extraction_items i
    where i.extraction_id = p_extraction_id
      and i.status in ('accepted', 'edited')
      and i.health_metric_id is null      -- 이미 승격된 항목은 건너뛴다
      and i.metric_code is not null
      and i.value is not null
  loop
    insert into public.health_metrics
      (user_id, metric_code, value, unit, measured_at, source, source_ref, note)
    values
      (item.user_id, item.metric_code, item.value,
       coalesce(item.unit, (select unit from public.metric_definitions
                            where code = item.metric_code)),
       measured, 'checkup',
       (select checkup_id from public.checkup_extractions where id = p_extraction_id),
       nullif(item.raw_label, ''))
    returning id into new_id;

    update public.checkup_extraction_items
    set health_metric_id = new_id
    where id = item.id;

    promoted := promoted + 1;
  end loop;

  update public.checkup_extractions
  set status = 'confirmed', reviewed_at = now()
  where id = p_extraction_id;

  return promoted;
end;
$$;

comment on function public.confirm_checkup_extraction is
  '검수한 항목만 health_metrics 로 승격한다. 자동 저장 경로는 존재하지 않는다.';


-- -----------------------------------------------------------------------------
-- 2. 되돌리기 — 확정을 취소하고 지표를 지운다
--
-- 잘못 확정했을 때 손으로 지표를 하나씩 지우게 하면 놓치는 항목이 생긴다.
-- -----------------------------------------------------------------------------

create or replace function public.revert_checkup_extraction(p_extraction_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  removed integer := 0;
begin
  with reverted as (
    delete from public.health_metrics
    where id in (
      select i.health_metric_id
      from public.checkup_extraction_items i
      where i.extraction_id = p_extraction_id
        and i.health_metric_id is not null
    )
    returning 1
  )
  select count(*) into removed from reverted;

  update public.checkup_extraction_items
  set health_metric_id = null
  where extraction_id = p_extraction_id;

  update public.checkup_extractions
  set status = 'review', reviewed_at = null
  where id = p_extraction_id;

  return removed;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. 검진 파일 삭제 시 Storage 객체 경로를 남긴다
--
-- Storage 객체는 DB cascade 대상이 아니다. 삭제된 경로를 큐에 남겨
-- 애플리케이션이 정리하게 한다 — 남은 파일은 곧 파기 의무 위반이 된다.
-- -----------------------------------------------------------------------------

create table public.storage_cleanup_queue (
  id           uuid primary key default gen_random_uuid(),
  bucket_id    text not null,
  storage_path text not null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

comment on table public.storage_cleanup_queue is
  '삭제 대기 중인 Storage 객체. 사용자 데이터가 아니므로 RLS 로 전부 막고 '
  'service_role 만 접근한다.';

create index storage_cleanup_pending_idx
  on public.storage_cleanup_queue (created_at)
  where deleted_at is null;

alter table public.storage_cleanup_queue enable row level security;
-- 정책 없음 = 사용자 접근 불가. service_role 은 RLS 를 우회한다.

create or replace function public.enqueue_checkup_document_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.storage_cleanup_queue (bucket_id, storage_path)
  values ('checkup-documents', old.storage_path);
  return old;
end;
$$;

create trigger checkup_documents_enqueue_cleanup
  after delete on public.checkup_documents
  for each row execute function public.enqueue_checkup_document_cleanup();


-- -----------------------------------------------------------------------------
-- 3-1. 검진을 지우면 그 검진에서 나온 수치도 함께 지운다
--
-- health_metrics.source_ref 는 외래키가 아니다 (여러 출처를 하나의 컬럼으로
-- 가리키기 때문). 그래서 검진을 지워도 승격된 수치가 그대로 남는다.
-- 남으면 두 가지가 잘못된다:
--   1. 사용자가 지운 검진의 값이 그래프에 계속 보인다
--   2. 추출 행이 사라져 revert_checkup_extraction 으로도 지울 수 없다
--
-- security invoker 라 RLS 가 걸려 남의 수치는 애초에 대상이 되지 않는다.
-- -----------------------------------------------------------------------------

create or replace function public.delete_checkup_metrics()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.health_metrics
  where user_id = old.user_id
    and source = 'checkup'
    and source_ref = old.id;
  return old;
end;
$$;

create trigger checkups_delete_metrics
  before delete on public.checkups
  for each row execute function public.delete_checkup_metrics();


-- -----------------------------------------------------------------------------
-- 4. 업로드 크기 상한 조정 (32MB → 20MB)
--
-- 0002 에서 "Claude API 요청 상한(32MB)과 맞춘다"고 적었는데 틀렸다.
-- 파일은 base64 로 인코딩해서 보내므로 크기가 약 1.33배로 불어난다.
-- 32MB 파일은 인코딩하면 ~43MB 가 되어 요청 상한을 넘는다.
--
-- 20MB → base64 ~27MB 로 상한 안에 들어온다. 검진 결과지는 보통 몇 MB 다.
-- -----------------------------------------------------------------------------

update storage.buckets
set file_size_limit = 20971520
where id = 'checkup-documents';


-- -----------------------------------------------------------------------------
-- 5. 검진 목록 화면용 요약
-- -----------------------------------------------------------------------------

create or replace function public.checkup_summaries()
returns table (
  checkup_id     uuid,
  checkup_date   date,
  institution    text,
  document_count integer,
  extraction_id  uuid,
  status         public.extraction_status,
  item_count     integer,
  confirmed_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.checkup_date,
    c.institution,
    (select count(*)::integer from public.checkup_documents d where d.checkup_id = c.id),
    e.id,
    e.status,
    (select count(*)::integer from public.checkup_extraction_items i
      where i.extraction_id = e.id),
    (select count(*)::integer from public.checkup_extraction_items i
      where i.extraction_id = e.id and i.health_metric_id is not null)
  from public.checkups c
  -- 검진 하나에 재판독으로 추출이 여러 개 생길 수 있다. 최신 것만 본다.
  left join lateral (
    select e2.* from public.checkup_extractions e2
    where e2.checkup_id = c.id
    order by e2.created_at desc
    limit 1
  ) e on true
  where c.user_id = (select auth.uid())
  order by c.checkup_date desc;
$$;
