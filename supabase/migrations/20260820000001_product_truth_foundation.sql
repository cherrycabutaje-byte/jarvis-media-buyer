-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260820000001_product_truth_foundation
-- Additive only - no destructive changes, no removal of any
-- existing column, enum value, policy, or row.
--
-- Product Truth + Master Product Asset V1 slice.
--
-- INSPECTION FINDINGS (inform this migration):
-- 1. products.product_type is free-text AD-FORMAT (e.g.
--    "static-advertisement"), confirmed distinct from the
--    business/physical-vs-service classification this slice needs -
--    a new column is genuinely required, not a rename/reuse.
-- 2. brain_runs.business_input already contains real productName/
--    productDescription - NOT duplicated here; Product Truth reads
--    these directly rather than storing a second copy.
-- 3. No literal price, product URL, or business-type classification
--    exists anywhere in the current schema - three new nullable
--    columns are the smallest safe additive fix.
-- 4. products.admins_can_update_products was checked directly
--    against remote and CONFIRMED ALREADY PRESENT
--    (is_workspace_member(workspace_id, 'admin'::workspace_role)),
--    matching exactly what this slice would otherwise have needed
--    to add - the productRepository.ts comment describing this as a
--    known gap is stale documentation, not current reality. Nothing
--    to add here; verified, not assumed.
-- 5. creative_asset_category is missing three genuinely distinct
--    labels the directive requires (product-in-use/lifestyle shots,
--    packaging, and SaaS/digital screenshots are meaningfully
--    different from a plain product photo for future Hybrid Engine
--    reasoning) - added as new enum values, existing values
--    untouched.
-- 6. Master Product Asset: a new nullable boolean flag on
--    creative_assets, defaulting false. Chosen over a separate table
--    since a master is always exactly one specific creative_assets
--    row per product - the smallest safe additive representation.
-- ============================================================

alter table products add column business_product_type text;
alter table products add column price text;
alter table products add column product_url text;

alter type creative_asset_category add value 'product_in_use';
alter type creative_asset_category add value 'packaging';
alter type creative_asset_category add value 'screenshot';

alter table creative_assets add column is_master boolean not null default false;

create index idx_creative_assets_master on creative_assets(product_id, is_master) where is_master;


create policy "admins_can_update_creative_assets"
  on creative_assets for update
  using (is_workspace_member(workspace_id, 'admin'::workspace_role))
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));
