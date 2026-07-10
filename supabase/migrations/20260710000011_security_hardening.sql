-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 011_security_hardening
-- Additive security fix - Database Version 1.0 defect correction
-- ============================================================

alter table stripe_webhook_events enable row level security;
alter table job_type_policies enable row level security;
alter table providers enable row level security;
alter table platform_provider_credentials enable row level security;
alter table default_providers enable row level security;
alter table provider_fallback_order enable row level security;
alter table provider_health enable row level security;

alter table plans enable row level security;
create policy "authenticated_can_view_plans"
  on plans for select
  to authenticated
  using (true);

alter table plan_prices enable row level security;
create policy "authenticated_can_view_plan_prices"
  on plan_prices for select
  to authenticated
  using (true);

alter table action_costs enable row level security;
create policy "authenticated_can_view_action_costs"
  on action_costs for select
  to authenticated
  using (true);

alter table publishing_platforms enable row level security;
create policy "authenticated_can_view_publishing_platforms"
  on publishing_platforms for select
  to authenticated
  using (true);

alter table learning_insights enable row level security;
create policy "authenticated_can_view_learning_insights"
  on learning_insights for select
  to authenticated
  using (true);

alter table subscriptions enable row level security;
create policy "members_can_view_subscriptions"
  on subscriptions for select
  using (is_workspace_member(workspace_id, 'viewer'));

alter table credit_balances enable row level security;
create policy "members_can_view_credit_balances"
  on credit_balances for select
  using (is_workspace_member(workspace_id, 'viewer'));

alter table credit_ledger enable row level security;
create policy "members_can_view_credit_ledger"
  on credit_ledger for select
  using (is_workspace_member(workspace_id, 'viewer'));

alter table usage_events enable row level security;
create policy "admins_can_view_usage_events"
  on usage_events for select
  using (is_workspace_member(workspace_id, 'admin'));

alter table jobs enable row level security;
create policy "members_can_view_jobs"
  on jobs for select
  using (is_workspace_member(workspace_id, 'viewer'));

alter table publications enable row level security;
create policy "members_can_view_publications"
  on publications for select
  using (is_workspace_member(workspace_id, 'viewer'));

create policy "admins_can_create_publications"
  on publications for insert
  with check (is_workspace_member(workspace_id, 'admin'));

alter table asset_approvals enable row level security;
create policy "members_can_view_asset_approvals"
  on asset_approvals for select
  using (
    exists (
      select 1 from assets a
      join products p on p.id = a.product_id
      where a.id = asset_approvals.asset_id
        and is_workspace_member(p.workspace_id, 'viewer')
    )
  );

create policy "admins_can_create_asset_approvals"
  on asset_approvals for insert
  with check (
    exists (
      select 1 from assets a
      join products p on p.id = a.product_id
      where a.id = asset_approvals.asset_id
        and is_workspace_member(p.workspace_id, 'admin')
    )
  );

alter table performance_records enable row level security;
create policy "members_can_view_performance_records"
  on performance_records for select
  using (
    exists (
      select 1 from publications pub
      where pub.id = performance_records.publication_id
        and is_workspace_member(pub.workspace_id, 'viewer')
    )
  );

alter table performance_summary enable row level security;
create policy "members_can_view_performance_summary"
  on performance_summary for select
  using (
    exists (
      select 1 from publications pub
      where pub.id = performance_summary.publication_id
        and is_workspace_member(pub.workspace_id, 'viewer')
    )
  );

alter table experiment_records enable row level security;
create policy "members_can_view_experiment_records"
  on experiment_records for select
  using (
    exists (
      select 1 from products p
      where p.id = experiment_records.product_id
        and is_workspace_member(p.workspace_id, 'viewer')
    )
  );

alter table winning_variations enable row level security;
create policy "members_can_view_winning_variations"
  on winning_variations for select
  using (
    exists (
      select 1 from products p
      where p.id = winning_variations.product_id
        and is_workspace_member(p.workspace_id, 'viewer')
    )
  );

alter table profiles enable row level security;

create policy "users_can_view_own_profile"
  on profiles for select
  using (auth.uid() = id);

create policy "users_can_update_own_profile"
  on profiles for update
  using (auth.uid() = id);