-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260818000001_creative_asset_foundation
-- Additive - one new table, two new enums, one storage bucket,
-- RLS policies on both. No modification to the frozen `assets`
-- table, its triggers, or the publication pipeline.
--
-- Media Asset Foundation + Creative Library V1 slice.
--
-- ARCHITECTURAL DISTINCTION (Step 10 of the approved directive):
-- the existing `assets` table is exclusively for the publication
-- pipeline - version_number is unique per product (a single active
-- version chain), assembled_by_job_id ties rows to AI generation
-- jobs, and two frozen triggers
-- (enforce_approval_before_publish, enforce_published_asset_
-- immutability) actively gate/lock rows through review_asset()/
-- mark_asset_ready(). It is not suitable for source/reusable
-- creative material, confirmed by direct schema inspection before
-- writing this migration - not assumed.
--
-- creative_assets is a genuinely new, small, additive table for
-- SOURCE ASSETS only (customer uploads, previous creatives) -
-- entirely separate from and never referenced by the publication
-- gates. Uploading here can NEVER make something publishable; only
-- the existing, unmodified `assets` -> review_asset() ->
-- mark_asset_ready() -> create_publication_request() chain can.
--
-- SOURCE/ORIGIN (Step 6): only two source_type values are included
-- - customer_upload and previous_creative - because those are the
-- only two truthfully reachable in this project today. JARVIS_
-- GENERATED and JARVIS_EDITED are not included since real image/
-- video generation and editing do not exist yet (image generation
-- remains mocked) - adding those values now would be inventing
-- functionality ahead of the architecture that supports it.
--
-- CATEGORY (Step 2): only categories genuinely supported by this
-- data model are included - product_image, video, brand_asset
-- (covers logos), testimonial, previous_creative. "Generated
-- Assets" is deliberately excluded from this enum for the same
-- reason as above.
--
-- STORAGE (Step 4): a new, PRIVATE storage bucket - confirmed zero
-- buckets existed before this migration (direct query). Workspace
-- isolation enforced via storage.objects RLS, parsing the first
-- path segment as workspace_id and checking it through the same,
-- already-trusted is_workspace_member() function used everywhere
-- else in this project - no new authorization primitive invented.
-- ============================================================

create type creative_asset_category as enum (
  'product_image',
  'video',
  'brand_asset',
  'testimonial',
  'previous_creative'
);

create type creative_asset_source as enum (
  'customer_upload',
  'previous_creative'
);

create table creative_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  category creative_asset_category not null,
  source_type creative_asset_source not null,
  storage_path text not null,
  original_filename text,
  mime_type text not null,
  file_size_bytes bigint not null,
  width_px integer,
  height_px integer,
  duration_seconds numeric,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_creative_assets_workspace on creative_assets(workspace_id);
create index idx_creative_assets_product on creative_assets(product_id);
create index idx_creative_assets_brand on creative_assets(brand_id);

alter table creative_assets enable row level security;

create policy "members_can_view_creative_assets"
  on creative_assets for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

create policy "admins_can_create_creative_assets"
  on creative_assets for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

create policy "admins_can_delete_creative_assets"
  on creative_assets for delete
  using (is_workspace_member(workspace_id, 'admin'::workspace_role));

-- ------------------------------------------------------------
-- Storage bucket: private by default, no public URL mechanism.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('creative-library', 'creative-library', false, 52428800)
on conflict (id) do nothing;

-- Path convention: {workspace_id}/{uuid}-{filename}. RLS parses
-- the first folder segment as the workspace_id and authorizes
-- through is_workspace_member() - the same function every other
-- workspace-scoped table in this project already relies on.

create policy "workspace_members_can_view_creative_library_files"
  on storage.objects for select
  using (
    bucket_id = 'creative-library'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'viewer'::workspace_role)
  );

create policy "workspace_admins_can_upload_creative_library_files"
  on storage.objects for insert
  with check (
    bucket_id = 'creative-library'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'admin'::workspace_role)
  );

create policy "workspace_admins_can_delete_creative_library_files"
  on storage.objects for delete
  using (
    bucket_id = 'creative-library'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'admin'::workspace_role)
  );