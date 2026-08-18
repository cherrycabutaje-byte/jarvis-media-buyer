-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260819000002_create_next_asset_version
-- Additive - one new SECURITY DEFINER function. No schema change,
-- no modification to the frozen `assets` table, its columns, its
-- unique constraint, or either of its two triggers.
--
-- Creative Production Engine V1 slice - CTO-directed fix.
--
-- INSPECTION FINDING (informs this fix): the `assets` schema
-- already anticipates multiple versions per product -
-- UNIQUE (product_id, version_number) only makes sense if more
-- than one version_number per product is expected, and
-- parent_asset_id is a self-referencing FK clearly intended for
-- version/lineage chains. Both existing triggers
-- (enforce_approval_before_publish, enforce_published_immutability)
-- fire BEFORE UPDATE only - never BEFORE INSERT - so creating a new
-- row is never blocked by them, regardless of any other asset's
-- approval/published state. The only genuine gap was a missing
-- repository/RPC operation for computing the next version number
-- SAFELY under concurrency - createFirstAsset() only ever creates
-- version_number = 1 by design (confirmed: its only other caller,
-- createFirstAssetFromJobAction in assetActions.ts, is untouched by
-- this migration and continues to work exactly as before).
--
-- CONCURRENCY SAFETY: pg_advisory_xact_lock(hashtext(product_id))
-- serializes concurrent creation attempts for the SAME product only
-- - other products' creation calls proceed independently and are
-- never blocked. The lock is automatically released at transaction
-- end (xact-scoped), requiring no manual cleanup. This is safer
-- than a client-side MAX(version_number)+1 read-then-write, which
-- would have a genuine race window between the two concurrent
-- transactions.
--
-- AUTHORIZATION: SECURITY DEFINER functions bypass RLS by default,
-- so this function re-implements the exact same authorization the
-- existing admins_can_create_assets RLS policy already expresses -
-- via the same, already-trusted is_workspace_member() function
-- used everywhere else in this project. No new authorization
-- primitive invented, and no authorization is weakened relative to
-- what direct RLS-protected inserts already required.
-- ============================================================

create or replace function create_next_asset_version(
  p_product_id uuid,
  p_architecture_version text,
  p_asset_payload jsonb,
  p_assembled_by_job_id uuid default null,
  p_parent_asset_id uuid default null,
  p_regeneration_reason text default null
)
returns assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_next_version integer;
  v_result assets;
begin
  select workspace_id into v_workspace_id from products where id = p_product_id;

  if v_workspace_id is null then
    raise exception 'Product not found';
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to create an asset for this product';
  end if;

  -- Serializes concurrent callers for this exact product only.
  -- Correctly covers the zero-existing-rows case too (two
  -- simultaneous "first version" attempts for a brand new product
  -- cannot both proceed at once), not just races against existing
  -- rows.
  perform pg_advisory_xact_lock(hashtext(p_product_id::text));

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from assets
  where product_id = p_product_id;

  insert into assets (
    product_id, version_number, parent_asset_id, architecture_version,
    asset_payload, assembled_by_job_id, regeneration_reason
  )
  values (
    p_product_id, v_next_version, p_parent_asset_id, p_architecture_version,
    p_asset_payload, p_assembled_by_job_id, p_regeneration_reason
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function create_next_asset_version(uuid, text, jsonb, uuid, uuid, text) from public;
grant execute on function create_next_asset_version(uuid, text, jsonb, uuid, uuid, text) to authenticated;
