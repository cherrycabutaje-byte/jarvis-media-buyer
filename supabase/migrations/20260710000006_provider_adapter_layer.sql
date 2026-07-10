-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 006_provider_adapter_layer
-- Component 6: Provider Adapter Layer
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create type provider_capability as enum ('text', 'image', 'video');

create table providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  capability provider_capability not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table platform_provider_credentials (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references providers(id) on delete cascade,
  encrypted_credential text not null,
  created_at timestamptz not null default now(),
  unique (provider_id)
);

create table default_providers (
  capability provider_capability primary key,
  provider_id uuid not null references providers(id)
);

create table provider_fallback_order (
  capability provider_capability not null,
  provider_id uuid not null references providers(id) on delete cascade,
  fallback_rank integer not null,
  primary key (capability, provider_id)
);

create table provider_health (
  provider_id uuid primary key references providers(id) on delete cascade,
  is_available boolean not null default true,
  consecutive_failures integer not null default 0,
  last_checked_at timestamptz not null default now(),
  last_error text
);