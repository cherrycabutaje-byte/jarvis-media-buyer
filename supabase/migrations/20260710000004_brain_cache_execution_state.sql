-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 004_brain_cache_execution_state
-- Component 4: Brain Cache & Execution State
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create type brain_execution_status as enum ('succeeded', 'failed');

alter table brain_runs
  add column business_state_hash text not null,
  add column execution_status brain_execution_status not null default 'succeeded',
  add column superseded_by uuid references brain_runs(id),
  add column started_at timestamptz not null default now(),
  add column completed_at timestamptz,
  add column duration_ms integer,
  add column error_detail text;

create index idx_brain_runs_business_state
  on brain_runs(brand_id, business_state_hash);