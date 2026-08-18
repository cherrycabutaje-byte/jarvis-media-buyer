-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260819000001_finished_creatives_storage
-- Additive - one new storage bucket, RLS policies. No table
-- changes, no modification to the frozen `assets` table or its
-- triggers.
--
-- Creative Production Engine V1 slice.
--
-- ARCHITECTURAL SEPARATION (preserved, not weakened):
-- creative_assets (creative-library bucket) = source/reusable
-- customer material. assets (this new finished-creatives bucket)
-- = finished publication creatives. A rendered static ad's actual
-- PNG bytes belong here, referenced from an `assets.asset_payload`
-- row - never duplicated into creative_assets, and never bypassing
-- the existing review_asset()/mark_asset_ready() gates.
--
-- PRIVATE by default (Step 10's explicit requirement) - same
-- workspace-isolated RLS pattern as creative-library, reusing the
-- same, already-trusted is_workspace_member() function. No public
-- URL mechanism; previews use time-limited signed URLs, exactly
-- matching the Creative Library's own established pattern.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('finished-creatives', 'finished-creatives', false, 20971520)
on conflict (id) do nothing;

-- Path convention: {workspace_id}/{uuid}.png - RLS parses the first
-- folder segment as workspace_id, identical to creative-library.

create policy "workspace_members_can_view_finished_creative_files"
  on storage.objects for select
  using (
    bucket_id = 'finished-creatives'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'viewer'::workspace_role)
  );

create policy "workspace_admins_can_upload_finished_creative_files"
  on storage.objects for insert
  with check (
    bucket_id = 'finished-creatives'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'admin'::workspace_role)
  );

create policy "workspace_admins_can_delete_finished_creative_files"
  on storage.objects for delete
  using (
    bucket_id = 'finished-creatives'
    and is_workspace_member(((storage.foldername(name))[1])::uuid, 'admin'::workspace_role)
  );