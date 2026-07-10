-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 009_learning_layer
-- Component 9: Learning Layer
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create table performance_records (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references publications(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index idx_performance_records_publication on performance_records(publication_id);

create table performance_summary (
  publication_id uuid primary key references publications(id) on delete cascade,
  latest_metrics jsonb not null default '{}'::jsonb,
  last_updated_at timestamptz not null default now()
);

create table experiment_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  variation_id uuid not null references variations(id),
  campaign_intelligence_snapshot jsonb not null,
  outcome_summary jsonb,
  concluded_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_experiment_records_product on experiment_records(product_id);

create table winning_variations (
  product_id uuid primary key references products(id),
  winning_variation_id uuid not null references variations(id),
  winning_reason text,
  determined_at timestamptz not null default now()
);

create table learning_insights (
  id uuid primary key default gen_random_uuid(),
  scope_category text,
  scope_framework text,
  insight_type text not null,
  confidence_band text not null,
  supporting_sample_size integer not null default 0,
  description text not null,
  computed_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index idx_learning_insights_category on learning_insights(scope_category);
create index idx_learning_insights_framework on learning_insights(scope_framework);