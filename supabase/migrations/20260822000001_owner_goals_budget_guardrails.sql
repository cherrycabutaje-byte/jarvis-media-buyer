-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260822000001_owner_goals_budget_guardrails
-- Additive only - no destructive changes.
--
-- Owner Goals + Budget + Risk Guardrails V1 slice.
--
-- OWNERSHIP DECISION (Step 8): scoped to `brands`, not workspaces,
-- products, or a not-yet-existing campaign concept. Verified via
-- direct inspection: one real workspace already manages 2 distinct
-- brands, and brain_runs/creative intelligence are already
-- brand-scoped throughout this project - a brand is the established
-- "one advertised business" unit. Workspace-level would incorrectly
-- force one shared budget across genuinely independent brands under
-- one account. Product-level would duplicate the same budget across
-- every product under one brand. Brand is the narrowest correct
-- scope given real, verified usage.
--
-- MONETARY CONVENTION: matches the exact existing pattern from
-- plan_prices (amount_cents integer + currency text).
--
-- No new RLS policy required - admins_can_update_brands already
-- exists and correctly covers these new columns.
-- ============================================================

alter table brands add column objective text
  check (objective is null or objective in ('SALES', 'LEADS', 'TRAFFIC', 'AWARENESS'));

alter table brands add column target_roas numeric
  check (target_roas is null or target_roas > 0);

alter table brands add column target_cpa_cents integer
  check (target_cpa_cents is null or target_cpa_cents >= 0);

alter table brands add column monthly_budget_cents integer
  check (monthly_budget_cents is null or monthly_budget_cents >= 0);

alter table brands add column daily_maximum_cents integer
  check (daily_maximum_cents is null or daily_maximum_cents >= 0);

alter table brands add column max_test_budget_cents integer
  check (max_test_budget_cents is null or max_test_budget_cents >= 0);

alter table brands add column budget_currency text;

alter table brands add column authority_mode text not null default 'ADVISOR'
  check (authority_mode in ('ADVISOR', 'COPILOT', 'AUTOPILOT'));
