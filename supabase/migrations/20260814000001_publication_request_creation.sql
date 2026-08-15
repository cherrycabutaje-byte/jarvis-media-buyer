-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260814000001_publication_request_creation
-- Additive - one new partial unique index, one new SECURITY
-- DEFINER function. No table/column/trigger/enum modification.
--
-- Publication Request Creation slice. Establishes the controlled,
-- human-initiated entry point for creating a publications row
-- against the existing, frozen "Architecture Version 1.0" schema
-- (migration 009_publishing_layer) - the publications table, its
-- publication_status enum, its trg_enforce_asset_approved_before_
-- publication trigger, its RLS policies, and its claimable index
-- are all untouched here.
--
-- DECISION 1 (approval AND readiness both required): the existing
-- frozen trigger only checks assets.approval_status = 'approved'.
-- Per explicit instruction, the trigger is NOT modified - it
-- remains as defense-in-depth. This function additionally requires
-- assets.status = 'ready' (Asset Publication Readiness's own gate),
-- so a publication request can only be created for an asset that
-- has passed BOTH gates, even though the frozen trigger alone only
-- enforces one of them.
--
-- DECISION 2 (duplicate/active-request protection): investigated
-- and empirically proven (via disposable, rolled-back local tests)
-- before writing this migration - see idx_publications_one_active
-- below. A bare function-level "SELECT ... then INSERT" check is
-- not concurrency-safe on its own (a classic check-then-insert
-- race), and the existing frozen admins_can_create_publications RLS
-- INSERT policy means a function-only check could be bypassed by a
-- direct insert entirely. The partial unique index closes both
-- gaps at once: it is enforced atomically by Postgres regardless of
-- which code path performs the INSERT, and it requires no
-- concurrency logic of its own. Confirmed empirically: a second
-- request for the same (asset_id, platform_id) while an existing
-- row is scheduled/queued/publishing/published is rejected by the
-- index itself; a new request succeeds once the prior row has
-- moved to failed/canceled (the only two states left uncovered by
-- the partial index, deliberately, so re-requesting after a
-- terminal failure is possible - no Republish workflow is
-- introduced here, this is simply what "already covered" vs "not
-- covered" naturally allows).
--
-- credential association is explicitly deferred - no foreign key
-- to publishing_credentials is added, no credential is read,
-- decrypted, or referenced anywhere in this migration.
--
-- job_id remains NULL on every row created by this function - no
-- evidence anywhere in the existing architecture requires it to be
-- populated at request-creation time; it exists for a future
-- Publication Worker Lifecycle slice to populate when it begins
-- processing a request, which is out of scope here.
-- ============================================================

-- ------------------------------------------------------------
-- Part 1: Partial unique index - additive, no existing row
-- affected (publications confirmed at 0 rows before this
-- migration).
-- ------------------------------------------------------------

create unique index idx_publications_one_active
  on publications(asset_id, platform_id)
  where status in ('scheduled', 'queued', 'publishing', 'published');

-- ------------------------------------------------------------
-- Part 2: create_publication_request - controlled,
-- human-authorized entry point
-- ------------------------------------------------------------

create or replace function public.create_publication_request(
  p_asset_id uuid,
  p_platform_id uuid
)
returns publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_asset_status asset_status;
  v_asset_approval approval_decision;
  v_workspace_id uuid;
  v_platform_id uuid;
  v_platform_active boolean;
  v_existing_active_id uuid;
  v_result publications;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to create a publication request';
  end if;

  select a.id, a.status, a.approval_status, p.workspace_id
  into v_asset_id, v_asset_status, v_asset_approval, v_workspace_id
  from public.assets a
  join public.products p on p.id = a.product_id
  where a.id = p_asset_id
  for update of a;

  if v_asset_id is null then
    raise exception 'Asset % not found', p_asset_id;
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'You are not authorized to create publication requests for this workspace';
  end if;

  if v_asset_approval is distinct from 'approved'::approval_decision then
    raise exception 'Asset % has not been approved (approval_status must be approved, found %)', p_asset_id, v_asset_approval;
  end if;

  if v_asset_status is distinct from 'ready'::asset_status then
    raise exception 'Asset % is not marked ready (status must be ready, found %)', p_asset_id, v_asset_status;
  end if;

  select pp.id, pp.is_active
  into v_platform_id, v_platform_active
  from public.publishing_platforms pp
  where pp.id = p_platform_id;

  if v_platform_id is null then
    raise exception 'Publishing platform % not found', p_platform_id;
  end if;

  if not v_platform_active then
    raise exception 'Publishing platform % is not active', p_platform_id;
  end if;

  select pub.id into v_existing_active_id
  from public.publications pub
  where pub.asset_id = p_asset_id
    and pub.platform_id = p_platform_id
    and pub.status in ('scheduled', 'queued', 'publishing', 'published')
  limit 1;

  if v_existing_active_id is not null then
    raise exception 'An active publication request already exists for this asset and platform (id: %)', v_existing_active_id;
  end if;

  begin
    insert into public.publications (
      asset_id, workspace_id, platform_id, initiated_by
    ) values (
      p_asset_id, v_workspace_id, p_platform_id, auth.uid()
    )
    returning * into v_result;
  exception
    when unique_violation then
      raise exception 'An active publication request already exists for this asset and platform';
  end;

  return v_result;
end;
$$;

revoke all on function public.create_publication_request(uuid, uuid) from public;
revoke all on function public.create_publication_request(uuid, uuid) from anon;
revoke all on function public.create_publication_request(uuid, uuid) from service_role;
grant execute on function public.create_publication_request(uuid, uuid) to authenticated;