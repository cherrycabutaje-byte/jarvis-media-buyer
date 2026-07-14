-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 024_mark_asset_ready_function
-- Additive - new SECURITY DEFINER function only, no schema change
--
-- Asset Publication Readiness slice - the first step in the
-- multi-slice publishing sequence (Readiness -> Platform Foundation
-- -> Credential Security -> Publication Request -> Worker Lifecycle
-- -> Confirmed Success). This function ONLY transitions
-- assets.status from 'draft' to 'ready' when approval_status is
-- already 'approved'. It does not touch publications,
-- publishing_platforms, or publishing_credentials in any way -
-- those remain entirely dormant. Only the final, real, confirmed
-- external publication operation (a future slice) may ever set
-- assets.status = 'published'.
--
-- Same architectural pattern as review_asset() (migration 023):
-- narrowly scoped SECURITY DEFINER function, row-locked eligibility
-- check, internal authorization via is_workspace_member(), explicit
-- grants (no reliance on default privileges, consistent with the
-- Lifecycle RPC Privilege Hardening emergency slice - migration 022
-- - which removed all automatic default execute grants).
--
-- Reverse or repeated transitions are structurally impossible, not
-- just rejected at runtime: this function accepts no target status
-- parameter at all - it only ever attempts draft -> ready - so a
-- caller cannot request 'draft' or 'published' through this
-- function. The eligibility check (status must be draft) also
-- means a second call after status has already become 'ready'
-- (or 'published') is correctly rejected, with no separate
-- uniqueness mechanism required.
-- ============================================================

create or replace function public.mark_asset_ready(
  p_asset_id uuid
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
  v_result assets;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to mark an asset ready';
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
    raise exception 'You are not authorized to mark this asset ready';
  end if;

  if v_status is distinct from 'draft'::asset_status then
    raise exception 'Asset % is not eligible to be marked ready (status must be draft, found %)', p_asset_id, v_status;
  end if;

  if v_approval_status is distinct from 'approved'::approval_decision then
    raise exception 'Asset % cannot be marked ready (approval_status must be approved, found %)', p_asset_id, v_approval_status;
  end if;

  update public.assets
  set status = 'ready'::asset_status
  where id = p_asset_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.mark_asset_ready(uuid) from public;
revoke all on function public.mark_asset_ready(uuid) from anon;
revoke all on function public.mark_asset_ready(uuid) from service_role;
grant execute on function public.mark_asset_ready(uuid) to authenticated;