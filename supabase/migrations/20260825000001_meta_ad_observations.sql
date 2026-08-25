-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260825000001_meta_ad_observations
-- Additive only.
--
-- Meta Ads Read Provider + Observation Sync V1 slice.
--
-- PERSISTENCE DECISION: meta_ad_account_sync_snapshots (prior slice)
-- stores one row per SYNC EVENT with campaigns/ad_sets/ads/
-- performance_metrics as jsonb ARRAYS - correct for its own purpose,
-- but cannot honestly support real per-observation deduplication/
-- revision, since there is no unique constraint at the observation
-- grain to upsert against.
--
-- performance_records/performance_summary are NOT reused - confirmed
-- again by inspection: both are structurally tied to `publications`
-- via a NOT NULL publication_id foreign key, with no honest meaning
-- for a Meta Ads entity.
--
-- This migration adds ONE new, narrowly-scoped table:
-- meta_ad_observations - one row per (link, entity_type, entity_id,
-- period_start, period_end), with a real unique constraint enabling
-- genuine ON CONFLICT DO UPDATE dedup/revision semantics. sync
-- timestamps are kept separate from the reporting period.
--
-- meta_ad_account_sync_snapshots remains unchanged, continuing to
-- serve its own purpose: a factual record of each sync ATTEMPT.
-- ============================================================

create table meta_ad_observations (
  id uuid primary key default gen_random_uuid(),
  meta_ad_account_link_id uuid not null references meta_ad_account_links(id) on delete cascade,
  entity_type text not null check (entity_type in ('ACCOUNT', 'CAMPAIGN', 'AD_SET', 'AD')),
  entity_id text not null,
  period_start date not null,
  period_end date not null,
  currency text,
  spend numeric,
  impressions bigint,
  reach bigint,
  frequency numeric,
  cpm numeric,
  clicks bigint,
  link_clicks bigint,
  ctr numeric,
  cpc numeric,
  results bigint,
  cost_per_result numeric,
  purchase_conversion_value numeric,
  roas numeric,
  attribution_setting text,
  first_synced_at timestamp with time zone not null default now(),
  last_synced_at timestamp with time zone not null default now(),
  unique (meta_ad_account_link_id, entity_type, entity_id, period_start, period_end)
);

create index idx_meta_ad_observations_link on meta_ad_observations(meta_ad_account_link_id);
create index idx_meta_ad_observations_entity on meta_ad_observations(entity_type, entity_id);

alter table meta_ad_observations enable row level security;

create policy "members_can_view_meta_ad_observations"
  on meta_ad_observations for select
  using (
    exists (
      select 1 from meta_ad_account_links l
      where l.id = meta_ad_observations.meta_ad_account_link_id
      and is_workspace_member(l.workspace_id, 'viewer'::workspace_role)
    )
  );

create policy "admins_can_write_meta_ad_observations"
  on meta_ad_observations for all
  using (
    exists (
      select 1 from meta_ad_account_links l
      where l.id = meta_ad_observations.meta_ad_account_link_id
      and is_workspace_member(l.workspace_id, 'admin'::workspace_role)
    )
  )
  with check (
    exists (
      select 1 from meta_ad_account_links l
      where l.id = meta_ad_observations.meta_ad_account_link_id
      and is_workspace_member(l.workspace_id, 'admin'::workspace_role)
    )
  );
