-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260902000001_meta_permission_observations
-- Additive only.
--
-- Meta OAuth Permission Capability V1 slice.
--
-- Dedicated table, deliberately separate from meta_page_identities -
-- stores TRUSTED, Meta-observed permission-grant snapshots (never a
-- client-asserted claim). Resolves the confirmed PERMISSION_GAP from
-- Meta Page Identity Verification V1 by giving Page/Instagram
-- identity sync a genuine, provider-derived basis for gating.
--
-- Never stores a token, App Secret, or authorization code - only the
-- permission name, its "granted"/"declined" status (Meta's own
-- real API semantics - no invented "expired" status), and when it
-- was observed.
--
-- A historical observation is never treated as eternal truth -
-- observed_at is persisted so a future execution preflight may
-- decide whether a fresh check is warranted. No expiration/max-age
-- threshold is invented here.
-- ============================================================

create table meta_permission_observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  meta_ad_account_link_id uuid not null references meta_ad_account_links(id) on delete cascade,
  permission text not null,
  status text not null check (status in ('granted', 'declined')),
  observed_at timestamp with time zone not null default now(),
  unique (meta_ad_account_link_id, permission)
);

create index idx_meta_permission_observations_brand on meta_permission_observations(brand_id);
create index idx_meta_permission_observations_workspace on meta_permission_observations(workspace_id);
create index idx_meta_permission_observations_link on meta_permission_observations(meta_ad_account_link_id);

alter table meta_permission_observations enable row level security;

create policy "members_can_view_meta_permission_observations"
  on meta_permission_observations for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

-- Insert/delete performed by server-side inspection logic
-- authenticated as the human session user, matching the existing
-- convention already established for meta_page_identities - the
-- real trust boundary is that the inspection action itself only
-- ever writes permissions genuinely returned by the provider for
-- the caller's own verified brand/link, never client-supplied.
create policy "admins_can_insert_meta_permission_observations"
  on meta_permission_observations for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

create policy "admins_can_delete_meta_permission_observations"
  on meta_permission_observations for delete
  using (is_workspace_member(workspace_id, 'admin'::workspace_role));
