-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 008_publishing_layer
-- Component 8: Publishing Layer
-- Architecture Version 1.0 - FROZEN
-- ============================================================

alter type job_type add value 'publish_asset';

alter table publishing_credentials
  add column token_expires_at timestamptz,
  add column platform_account_id text;

create table publishing_platforms (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type publication_status as enum (
  'scheduled', 'queued', 'publishing', 'published', 'failed', 'canceled'
);

create table publications (
  id uuid primary key default uuid_generate_v4(),
  asset_id uuid not null references assets(id),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform_id uuid not null references publishing_platforms(id),
  job_id uuid references jobs(id),
  status publication_status not null default 'scheduled',
  scheduled_at timestamptz not null default now(),
  published_at timestamptz,
  platform_metadata jsonb not null default '{}'::jsonb,
  external_reference_id text,
  last_error text,
  error_category text,
  initiated_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_publications_asset on publications(asset_id);
create index idx_publications_workspace on publications(workspace_id);
create index idx_publications_claimable
  on publications(scheduled_at)
  where status in ('scheduled', 'queued');

create or replace function enforce_asset_approved_before_publication()
returns trigger
language plpgsql
as $$
declare
  asset_approval approval_decision;
begin
  select approval_status into asset_approval from assets where id = new.asset_id;
  if asset_approval is distinct from 'approved' then
    raise exception 'Cannot create a publication for an asset that has not been approved';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_asset_approved_before_publication
  before insert on publications
  for each row
  execute function enforce_asset_approved_before_publication();