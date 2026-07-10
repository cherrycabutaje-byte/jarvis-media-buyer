-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 003_billing_subscription
-- Component 3: Billing & Subscription
-- Architecture Version 1.0 - FROZEN
-- ============================================================

create type workspace_status as enum (
  'trialing', 'active', 'past_due', 'suspended', 'canceled'
);

alter table workspaces
  add column status workspace_status not null default 'trialing';

create table plans (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  name text not null,
  stripe_product_id text,
  monthly_credit_allowance integer not null,
  max_brands integer,
  max_workspace_members integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table plan_prices (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references plans(id) on delete cascade,
  stripe_price_id text not null unique,
  billing_interval text not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete'
);

create table subscriptions (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  plan_id uuid not null references plans(id),
  plan_price_id uuid references plan_prices(id),
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  status subscription_status not null default 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);

create table credit_balances (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create type credit_transaction_type as enum (
  'plan_grant', 'purchase', 'consumption', 'refund', 'adjustment'
);

create table credit_ledger (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  transaction_type credit_transaction_type not null,
  amount integer not null,
  balance_after integer not null,
  related_product_id uuid references products(id),
  related_brain_run_id uuid references brain_runs(id),
  stripe_invoice_id text,
  description text,
  created_at timestamptz not null default now()
);

create index idx_credit_ledger_workspace on credit_ledger(workspace_id);

create type usage_event_type as enum (
  'brain_run', 'product_generation', 'provider_call'
);

create table usage_events (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  event_type usage_event_type not null,
  related_product_id uuid references products(id),
  related_brain_run_id uuid references brain_runs(id),
  credits_consumed integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_usage_events_workspace on usage_events(workspace_id);

create table action_costs (
  action_type usage_event_type primary key,
  credit_cost integer not null
);

create table stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null
);

create or replace function enforce_max_brands()
returns trigger
language plpgsql
as $$
declare
  brand_limit integer;
  current_count integer;
begin
  select p.max_brands into brand_limit
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.workspace_id = new.workspace_id;

  if brand_limit is not null then
    select count(*) into current_count
    from brands
    where workspace_id = new.workspace_id;

    if current_count >= brand_limit then
      raise exception 'Brand limit reached for this workspace''s plan (max %)', brand_limit;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_max_brands
  before insert on brands
  for each row
  execute function enforce_max_brands();

create or replace function enforce_max_workspace_members()
returns trigger
language plpgsql
as $$
declare
  member_limit integer;
  current_count integer;
begin
  select p.max_workspace_members into member_limit
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.workspace_id = new.workspace_id;

  if member_limit is not null then
    select count(*) into current_count
    from workspace_members
    where workspace_id = new.workspace_id;

    if current_count >= member_limit then
      raise exception 'Member limit reached for this workspace''s plan (max %)', member_limit;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_max_workspace_members
  before insert on workspace_members
  for each row
  execute function enforce_max_workspace_members();