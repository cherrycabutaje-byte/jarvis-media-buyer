-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 005_job_queue_orchestration
-- Component 5: Job Queue & Execution Orchestration
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create type job_type as enum (
  'text_generation', 'image_generation', 'video_generation', 'asset_assembly'
);

create table job_type_policies (
  job_type job_type primary key,
  max_attempts integer not null,
  timeout_seconds integer not null,
  base_backoff_seconds integer not null default 1
);

create type job_status as enum (
  'queued', 'processing', 'succeeded', 'failed', 'retrying', 'dead_letter'
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  variation_id uuid references variations(id) on delete cascade,
  job_type job_type not null,
  status job_status not null default 'queued',
  priority integer not null default 100,
  payload jsonb not null,
  result jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null,
  last_error text,
  credits_reserved integer not null default 0,
  idempotency_key text not null unique,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_jobs_claimable
  on jobs(priority, scheduled_at)
  where status in ('queued', 'retrying');

create index idx_jobs_workspace on jobs(workspace_id);
create index idx_jobs_product on jobs(product_id);