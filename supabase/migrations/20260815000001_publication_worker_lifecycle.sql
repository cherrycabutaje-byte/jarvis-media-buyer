-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260815000001_publication_worker_lifecycle
-- Additive - three new SECURITY DEFINER functions, service_role
-- only. No schema/table/trigger/index modification. No change to
-- create_publication_request() (Publication Request Creation,
-- frozen at commit e37cd28) or any other frozen object.
--
-- Publication Worker Lifecycle slice. Mirrors the exact, already
-- proven claim_next_job/complete_job/fail_job pattern (migrations
-- 018/019/021, hardened to service_role-only in migration
-- 20260718000001_worker_rpc_isolation), applied to publications.
--
-- claim_next_publication() takes NO parameters, unlike
-- claim_next_job(p_locked_by text) - publications has no
-- locked_by/locked_at columns (confirmed by direct schema
-- inspection), so there is nothing to store such a parameter into.
-- Row-lock (FOR UPDATE SKIP LOCKED) plus the status transition to
-- 'publishing' provides the same double-claim protection without
-- an unused column/parameter.
--
-- Uses the existing idx_publications_claimable partial index
-- (status IN ('scheduled','queued'), already present since the
-- original frozen publishing_layer migration) - no new index
-- needed.
--
-- No retry/backoff state is invented. publication_status has no
-- 'retrying' value (confirmed) - 'failed' is a terminal state for
-- that publication row. A future retry is represented by an
-- entirely new create_publication_request() call, which the
-- existing idx_publications_one_active partial unique index already
-- permits once the prior row is 'failed' or 'canceled' (proven in
-- the Publication Request Creation slice's own validation).
--
-- All three functions are service_role-only, matching the
-- Authenticated Worker RPC Isolation boundary exactly - claiming
-- and processing a publication is a trusted machine operation, not
-- a human-facing one (distinct from create_publication_request(),
-- which remains authenticated-only and is unmodified here).
-- ============================================================

create or replace function public.claim_next_publication()
returns publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publication publications;
begin
  select * into v_publication
  from publications
  where status in ('scheduled', 'queued')
    and scheduled_at <= now()
  order by scheduled_at
  for update skip locked
  limit 1;

  if v_publication.id is null then
    return null;
  end if;

  update publications
  set status = 'publishing'
  where id = v_publication.id
  returning * into v_publication;

  return v_publication;
end;
$$;

revoke all on function public.claim_next_publication() from public;
revoke all on function public.claim_next_publication() from anon;
revoke all on function public.claim_next_publication() from authenticated;
grant execute on function public.claim_next_publication() to service_role;

create or replace function public.complete_publication(
  p_publication_id uuid,
  p_external_reference_id text default null,
  p_platform_metadata jsonb default null
)
returns publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publication publications;
begin
  select * into v_publication
  from publications
  where id = p_publication_id
  for update;

  if v_publication.id is null then
    raise exception 'Publication % not found', p_publication_id;
  end if;

  if v_publication.status is distinct from 'publishing'::publication_status then
    raise exception 'Publication % is not eligible to be completed (status must be publishing, found %)', p_publication_id, v_publication.status;
  end if;

  update publications
  set status = 'published',
      published_at = now(),
      external_reference_id = coalesce(p_external_reference_id, external_reference_id),
      platform_metadata = coalesce(p_platform_metadata, platform_metadata)
  where id = p_publication_id
  returning * into v_publication;

  return v_publication;
end;
$$;

revoke all on function public.complete_publication(uuid, text, jsonb) from public;
revoke all on function public.complete_publication(uuid, text, jsonb) from anon;
revoke all on function public.complete_publication(uuid, text, jsonb) from authenticated;
grant execute on function public.complete_publication(uuid, text, jsonb) to service_role;

create or replace function public.fail_publication(
  p_publication_id uuid,
  p_error text,
  p_error_category text default null
)
returns publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_publication publications;
begin
  select * into v_publication
  from publications
  where id = p_publication_id
  for update;

  if v_publication.id is null then
    raise exception 'Publication % not found', p_publication_id;
  end if;

  if v_publication.status is distinct from 'publishing'::publication_status then
    raise exception 'Publication % is not eligible to be failed (status must be publishing, found %)', p_publication_id, v_publication.status;
  end if;

  update publications
  set status = 'failed',
      last_error = p_error,
      error_category = p_error_category
  where id = p_publication_id
  returning * into v_publication;

  return v_publication;
end;
$$;

revoke all on function public.fail_publication(uuid, text, text) from public;
revoke all on function public.fail_publication(uuid, text, text) from anon;
revoke all on function public.fail_publication(uuid, text, text) from authenticated;
grant execute on function public.fail_publication(uuid, text, text) to service_role;