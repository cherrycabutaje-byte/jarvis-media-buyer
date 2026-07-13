-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 023_review_asset_function
-- Additive - new SECURITY DEFINER function only, no schema change
--
-- Asset Approval Decision slice. Same architectural reasoning as
-- claim_next_job()/complete_job()/fail_job(): reviewing an asset is
-- a specific, atomic business operation requiring internal
-- authorization (workspace admin rank via the existing
-- is_workspace_member() helper), not ordinary CRUD - so a narrowly
-- scoped SECURITY DEFINER function is used instead of a general
-- assets UPDATE policy.
--
-- Enum type confirmed via direct inspection (not assumed): both
-- assets.approval_status and asset_approvals.decision use the exact
-- same underlying type, approval_decision (confirmed via
-- information_schema.columns.udt_name). An explicit guarded mapping
-- is used regardless, rather than an unrestricted cast, so intent is
-- unambiguous even though the two columns share one type today.
--
-- Concurrency: the target asset row is locked (FOR UPDATE OF a) at
-- the start of the eligibility check and held for the duration of
-- the transaction. A second concurrent call against the same asset
-- blocks on this SELECT until the first call's transaction commits,
-- then re-reads the now-updated approval_status - correctly finding
-- it no longer 'pending' and hitting the same "already reviewed"
-- domain error a sequential second call would. This guarantees at
-- most one successful review per asset in this slice, even without
-- any unique constraint on asset_approvals.asset_id.
--
-- This function does NOT: change assets.status, publish the asset,
-- edit asset_payload, change version_number/architecture_version/
-- assembled_by_job_id, create a new asset, or modify the source job,
-- product, or brain run. Only assets.approval_status is updated, and
-- one asset_approvals audit row is inserted.
-- ============================================================

create or replace function public.review_asset(
  p_asset_id uuid,
  p_decision approval_decision,
  p_notes text
)
returns assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_status asset_status;
  v_approval_status approval_decision;
  v_workspace_id uuid;
  v_mapped_decision approval_decision;
  v_normalized_notes text;
  v_result assets;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to review an asset';
  end if;

  if p_decision is null then
    raise exception 'Decision is required';
  end if;

  if p_decision = 'approved'::approval_decision then
    v_mapped_decision := 'approved'::approval_decision;
  elsif p_decision = 'rejected'::approval_decision then
    v_mapped_decision := 'rejected'::approval_decision;
  elsif p_decision = 'changes_requested'::approval_decision then
    v_mapped_decision := 'changes_requested'::approval_decision;
  else
    raise exception 'Invalid decision: % is not a valid reviewer decision (pending is not a reviewer action)', p_decision;
  end if;

  if v_mapped_decision = 'approved'::approval_decision then
    if p_notes is null or trim(p_notes) = '' then
      v_normalized_notes := null;
    else
      v_normalized_notes := trim(p_notes);
    end if;
  else
    if p_notes is null or trim(p_notes) = '' then
      raise exception 'Notes are required for a % decision', v_mapped_decision;
    end if;
    v_normalized_notes := trim(p_notes);
  end if;

  select a.id, a.status, a.approval_status, p.workspace_id
  into v_asset_id, v_status, v_approval_status, v_workspace_id
  from public.assets a
  join public.products p on p.id = a.product_id
  where a.id = p_asset_id
  for update of a;

  if v_asset_id is null then
    raise exception 'Asset % not found', p_asset_id;
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'You are not authorized to review this asset';
  end if;

  if v_status is distinct from 'draft'::asset_status then
    raise exception 'Asset % is not eligible for review (status must be draft, found %)', p_asset_id, v_status;
  end if;

  if v_approval_status is distinct from 'pending'::approval_decision then
    raise exception 'Asset % has already been reviewed (approval_status is %, not pending)', p_asset_id, v_approval_status;
  end if;

  insert into public.asset_approvals (asset_id, decision, reviewed_by, notes)
  values (p_asset_id, v_mapped_decision, auth.uid(), v_normalized_notes);

  update public.assets
  set approval_status = v_mapped_decision
  where id = p_asset_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.review_asset(uuid, approval_decision, text) from public;
revoke all on function public.review_asset(uuid, approval_decision, text) from anon;
revoke all on function public.review_asset(uuid, approval_decision, text) from service_role;
grant execute on function public.review_asset(uuid, approval_decision, text) to authenticated;