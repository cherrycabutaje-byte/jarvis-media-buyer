-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260823000001_meta_ads_account_link
-- Additive only.
--
-- Meta Ads Account Connection V1 (READ-ONLY) slice.
--
-- SCOPE: brand-scoped, matching Owner Goals + Budget Guardrails V1's
-- precedent. workspace_id included alongside brand_id, matching the
-- exact dual-scoping convention already used by publishing_credentials.
--
-- CREDENTIAL STORAGE: follows the EXACT existing pattern from
-- configure_publishing_credential() (inspected directly before
-- writing this migration) - vault.create_secret() for the real
-- access token, only a vault_secret_id uuid stored in the plain
-- table, workspace-admin authorization via is_workspace_member().
-- A NEW, dedicated table is used rather than reusing
-- publishing_credentials, since a Meta Ads Marketing API token is a
-- genuinely different credential purpose/scope than a Page
-- publishing token.
--
-- READ-ONLY BY DESIGN: no campaign/ad-set/ad creation, no spend
-- execution, and no write-capable RPC exists anywhere here.
--
-- PERFORMANCE DATA: confirmed by direct inspection that the existing
-- performance_records/performance_summary tables are NOT reused -
-- their schema is structurally tied to `publications` (organic Page
-- posts) via a NOT NULL publication_id foreign key, which has no
-- honest meaning for a Meta Ads campaign/ad-set/ad. New, purpose-
-- built tables are used instead, following the same jsonb-metrics
-- convention for consistency.
-- ============================================================

create table meta_ad_account_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  meta_ad_account_id text not null,
  meta_business_id text,
  vault_secret_id uuid,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  connected_by uuid references profiles(id),
  connected_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  last_sync_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (brand_id)
);

create index idx_meta_ad_account_links_workspace on meta_ad_account_links(workspace_id);
create index idx_meta_ad_account_links_brand on meta_ad_account_links(brand_id);

alter table meta_ad_account_links enable row level security;

create policy "members_can_view_meta_ad_account_links"
  on meta_ad_account_links for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

create policy "admins_can_manage_meta_ad_account_links"
  on meta_ad_account_links for all
  using (is_workspace_member(workspace_id, 'admin'::workspace_role))
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

create table meta_ad_account_sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  meta_ad_account_link_id uuid not null references meta_ad_account_links(id) on delete cascade,
  synced_at timestamp with time zone not null default now(),
  campaigns jsonb not null default '[]'::jsonb,
  ad_sets jsonb not null default '[]'::jsonb,
  ads jsonb not null default '[]'::jsonb,
  performance_metrics jsonb not null default '{}'::jsonb,
  source text not null default 'meta_graph_api'
);

create index idx_meta_sync_snapshots_link on meta_ad_account_sync_snapshots(meta_ad_account_link_id, synced_at desc);

alter table meta_ad_account_sync_snapshots enable row level security;

create policy "members_can_view_meta_sync_snapshots"
  on meta_ad_account_sync_snapshots for select
  using (
    exists (
      select 1 from meta_ad_account_links l
      where l.id = meta_ad_account_sync_snapshots.meta_ad_account_link_id
      and is_workspace_member(l.workspace_id, 'viewer'::workspace_role)
    )
  );

create or replace function connect_meta_ad_account(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_meta_ad_account_id text,
  p_meta_business_id text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_link_id uuid;
begin
  if not is_workspace_member(p_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to connect a Meta ad account for this workspace';
  end if;

  v_secret_id := vault.create_secret(p_access_token, 'meta_ad_account_' || p_brand_id);

  insert into meta_ad_account_links (
    workspace_id, brand_id, meta_ad_account_id, meta_business_id,
    vault_secret_id, status, connected_by, connected_at
  )
  values (
    p_workspace_id, p_brand_id, p_meta_ad_account_id, p_meta_business_id,
    v_secret_id, 'connected', auth.uid(), now()
  )
  on conflict (brand_id) do update set
    meta_ad_account_id = excluded.meta_ad_account_id,
    meta_business_id = excluded.meta_business_id,
    vault_secret_id = excluded.vault_secret_id,
    status = 'connected',
    connected_by = auth.uid(),
    connected_at = now(),
    last_sync_error = null,
    updated_at = now()
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke all on function connect_meta_ad_account(uuid, uuid, text, text, text) from public;
grant execute on function connect_meta_ad_account(uuid, uuid, text, text, text) to authenticated;

create or replace function get_meta_ad_account_credential(p_link_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_secret_id uuid;
  v_secret_value text;
begin
  select workspace_id, vault_secret_id into v_workspace_id, v_secret_id
  from meta_ad_account_links where id = p_link_id;

  if v_workspace_id is null then
    raise exception 'Meta ad account link not found';
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to access this credential';
  end if;

  select decrypted_secret into v_secret_value
  from vault.decrypted_secrets where id = v_secret_id;

  return v_secret_value;
end;
$$;

revoke all on function get_meta_ad_account_credential(uuid) from public;
grant execute on function get_meta_ad_account_credential(uuid) to authenticated;

create or replace function disconnect_meta_ad_account(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from meta_ad_account_links where id = p_link_id;

  if v_workspace_id is null then
    raise exception 'Meta ad account link not found';
  end if;

  if not is_workspace_member(v_workspace_id, 'admin'::workspace_role) then
    raise exception 'Not authorized to disconnect this account';
  end if;

  update meta_ad_account_links set status = 'disconnected', updated_at = now() where id = p_link_id;
end;
$$;

revoke all on function disconnect_meta_ad_account(uuid) from public;
grant execute on function disconnect_meta_ad_account(uuid) to authenticated;
