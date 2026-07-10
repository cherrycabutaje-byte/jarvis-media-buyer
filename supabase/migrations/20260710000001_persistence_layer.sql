-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 001_persistence_layer
-- Component 1: Persistence Layer
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create extension if not exists "uuid-ossp";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type workspace_role as enum ('owner', 'admin', 'member');

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table brands (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  website text,
  brand_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_brands_workspace on brands(workspace_id);

create type brain_run_status as enum ('complete', 'partial', 'unknown', 'invalidated');

create table brain_runs (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid not null references brands(id) on delete cascade,
  architecture_version text not null,
  business_input jsonb not null,
  intelligence_pipeline jsonb not null,
  status brain_run_status not null,
  is_current boolean not null default true,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now()
);

create index idx_brain_runs_brand on brain_runs(brand_id);
create unique index idx_brain_runs_one_current
  on brain_runs(brand_id)
  where is_current;

create type product_status as enum ('pending', 'building', 'ready', 'failed');

create table products (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  brain_run_id uuid not null references brain_runs(id),
  product_type text not null,
  status product_status not null default 'pending',
  product_structure jsonb,
  package_definition jsonb,
  decision_record jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_workspace on products(workspace_id);
create index idx_products_brand on products(brand_id);
create index idx_products_brain_run on products(brain_run_id);

create table variations (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  variation_id text not null,
  variation_definition jsonb not null,
  execution_package jsonb,
  created_at timestamptz not null default now(),
  unique (product_id, variation_id)
);

create index idx_variations_product on variations(product_id);

create type asset_status as enum ('draft', 'ready', 'published');

create table assets (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  version_number integer not null,
  parent_asset_id uuid references assets(id),
  architecture_version text not null,
  status asset_status not null default 'draft',
  asset_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (product_id, version_number)
);

create index idx_assets_product on assets(product_id);
create index idx_assets_parent on assets(parent_asset_id);

create table provider_credentials (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider_name text not null,
  encrypted_credential text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider_name)
);

create table publishing_credentials (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform_name text not null,
  encrypted_credential text not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, platform_name)
);