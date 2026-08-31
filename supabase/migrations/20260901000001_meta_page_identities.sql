-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260901000001_meta_page_identities
-- Additive only.
--
-- Meta Page & Instagram Identity Read / Verification V1 slice.
--
-- Dedicated table, deliberately separate from
-- creative_execution_contexts - stores TRUSTED, Meta-observed Page
-- (and, where linked, Instagram business/professional) identity
-- snapshots, never provider synchronization state mixed into the
-- execution-context table.
--
-- "Verified"/observed here means only: this identity was returned
-- by Meta's own read API through the connected account's trusted
-- credential path (meta_ad_account_link_id). It is never a Meta
-- "Verified" badge, legal ownership, or authorization to publish or
-- spend.
--
-- Never stores an access token - meta_ad_account_link_id is a
-- foreign key reference to the link whose already-vaulted credential
-- was used to observe this identity; the credential itself remains
-- exclusively in Supabase Vault via the existing
-- connect_meta_ad_account()/get_meta_ad_account_credential() RPCs.
--
-- UNIQUENESS: a given Meta Page ID is trusted only in the context of
-- the exact link that observed it - the same page_id can appear
-- under different meta_ad_account_link_id rows if multiple brands
-- happen to have legitimate access to the same Page, but a Page
-- observed for one link's brand is never automatically trusted for
-- another brand's link.
-- ============================================================

create table meta_page_identities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  meta_ad_account_link_id uuid not null references meta_ad_account_links(id) on delete cascade,
  page_id text not null,
  page_name text,
  instagram_actor_id text,
  instagram_username text,
  observed_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (meta_ad_account_link_id, page_id)
);

create index idx_meta_page_identities_brand on meta_page_identities(brand_id);
create index idx_meta_page_identities_workspace on meta_page_identities(workspace_id);
create index idx_meta_page_identities_link on meta_page_identities(meta_ad_account_link_id);
create index idx_meta_page_identities_page on meta_page_identities(page_id);

alter table meta_page_identities enable row level security;

create policy "members_can_view_meta_page_identities"
  on meta_page_identities for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

-- Insert/update/delete are performed by server-side sync logic
-- authenticated as the human session user (matching the existing
-- convention for meta_ad_observations and meta_ad_account_sync_snapshots),
-- so admins may insert - the real trust boundary is that the sync
-- action itself only ever writes identities genuinely returned by
-- the read provider for the caller's own verified brand/link, never
-- from client-supplied identity data.
create policy "admins_can_insert_meta_page_identities"
  on meta_page_identities for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

create policy "admins_can_delete_meta_page_identities"
  on meta_page_identities for delete
  using (is_workspace_member(workspace_id, 'admin'::workspace_role));
