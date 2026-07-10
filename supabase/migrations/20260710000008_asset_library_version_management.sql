-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 007_asset_library_version_management
-- Component 7: Asset Library & Version Management
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create type approval_decision as enum (
  'pending', 'approved', 'rejected', 'changes_requested'
);

alter table assets
  add column approval_status approval_decision not null default 'pending',
  add column assembled_by_job_id uuid references jobs(id),
  add column regeneration_reason text;

create table asset_approvals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  decision approval_decision not null,
  reviewed_by uuid not null references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_asset_approvals_asset on asset_approvals(asset_id);

create or replace function enforce_approval_before_publish()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and new.approval_status is distinct from 'approved' then
    raise exception 'Asset cannot be published without an approved approval_status';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_approval_before_publish
  before update on assets
  for each row
  execute function enforce_approval_before_publish();

create or replace function enforce_published_asset_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and new.asset_payload is distinct from old.asset_payload then
    raise exception 'Published assets are immutable - create a new version via regeneration or duplication instead';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_published_immutability
  before update on assets
  for each row
  execute function enforce_published_asset_immutability();