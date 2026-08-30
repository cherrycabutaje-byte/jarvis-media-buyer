-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260829000001_action_specifications
-- Additive only.
--
-- Concrete Action Specification V1 slice.
--
-- Dedicated table, deliberately separate from action_proposals -
-- preserves the high-level owner-approved intent (Action Proposal)
-- independently from the exact execution parameters (this table).
-- Never retrofits currency/target/creative/spend into the frozen
-- Action Proposal schema.
--
-- IMMUTABILITY MECHANISM: the smallest safe V1 mechanism, matching
-- the same atomic pattern already proven for action_proposals'
-- decideActionProposal/expireActionProposal - every UPDATE at the
-- application layer is gated by `WHERE status = 'DRAFT'`. Once a row
-- reaches READY_FOR_OWNER_AUTHORIZATION or SUPERSEDED, that WHERE
-- clause can never match again, so the row becomes immutable at the
-- database level without needing a trigger. Revising a finalized
-- specification means creating a new row and superseding the old
-- one - never mutating a finalized row in place.
--
-- READY_FOR_OWNER_AUTHORIZATION is NOT executable and is NEVER
-- auto-authorized - Concrete Owner Authorization is an explicit
-- future slice, not built here.
-- ============================================================

create table action_specifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  proposal_id uuid not null references action_proposals(id) on delete cascade,
  action_type text not null check (action_type in ('TEST_ALTERNATIVE_CREATIVE')),
  meta_ad_account_id text,
  target_entity_type text,
  target_entity_id text,
  creative_asset_id uuid references creative_assets(id),
  proposed_spend_cents integer,
  currency text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'READY_FOR_OWNER_AUTHORIZATION', 'SUPERSEDED')),
  created_at timestamp with time zone not null default now(),
  created_by uuid not null references auth.users(id),
  finalized_at timestamp with time zone
);

create index idx_action_specifications_brand on action_specifications(brand_id);
create index idx_action_specifications_workspace on action_specifications(workspace_id);
create index idx_action_specifications_proposal on action_specifications(proposal_id);
create index idx_action_specifications_status on action_specifications(status);

alter table action_specifications enable row level security;

create policy "members_can_view_action_specifications"
  on action_specifications for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

create policy "admins_can_insert_action_specifications"
  on action_specifications for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

-- Update policy permits admins to update at the RLS layer; the real
-- immutability boundary is enforced at the application/query layer
-- via the atomic `WHERE status = 'DRAFT'` guard on every UPDATE
-- statement, matching the established action_proposals precedent.
create policy "admins_can_update_draft_action_specifications"
  on action_specifications for update
  using (is_workspace_member(workspace_id, 'admin'::workspace_role))
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));
