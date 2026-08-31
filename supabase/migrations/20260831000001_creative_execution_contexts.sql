-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260831000001_creative_execution_contexts
-- Additive only.
--
-- Creative Execution Context V1 slice.
--
-- Dedicated table, deliberately separate from action_specifications
-- - carries the material ad-construction fields discovered missing
-- by the Meta Execution Plan audit (primary text, destination URL,
-- call-to-action, Facebook Page identity, and optional headline/
-- description/Instagram identity). These fields materially affect
-- what advertisement would be created and were never covered by the
-- specification's own earlier authorization - this table has its
-- own, entirely independent decision provenance (decided_at,
-- decided_by), never reusing or reinterpreting
-- action_specifications.decided_at/decided_by.
--
-- page_identity_verified defaults to false and is never set true by
-- any application code in V1 - no trusted, persisted source proves
-- Facebook Page ownership/access in the current architecture. This
-- column exists so a future slice that DOES implement verification
-- can set it, and so the readiness validator can fail closed
-- honestly rather than omitting the check entirely.
--
-- IMMUTABILITY: identical atomic UPDATE...WHERE status = 'DRAFT'
-- pattern already proven for action_specifications - once a row
-- reaches READY_FOR_OWNER_AUTHORIZATION, AUTHORIZED, DECLINED, or
-- SUPERSEDED, its material fields become immutable at the
-- application layer.
-- ============================================================

create table creative_execution_contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  specification_id uuid not null references action_specifications(id) on delete cascade,
  primary_text text,
  headline text,
  description text,
  destination_url text,
  call_to_action_type text,
  page_id text,
  page_identity_verified boolean not null default false,
  instagram_actor_id text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'READY_FOR_OWNER_AUTHORIZATION', 'AUTHORIZED', 'DECLINED', 'SUPERSEDED')),
  created_at timestamp with time zone not null default now(),
  created_by uuid not null references auth.users(id),
  decided_at timestamp with time zone,
  decided_by uuid references auth.users(id)
);

create index idx_creative_execution_contexts_brand on creative_execution_contexts(brand_id);
create index idx_creative_execution_contexts_workspace on creative_execution_contexts(workspace_id);
create index idx_creative_execution_contexts_specification on creative_execution_contexts(specification_id);
create index idx_creative_execution_contexts_status on creative_execution_contexts(status);

alter table creative_execution_contexts enable row level security;

create policy "members_can_view_creative_execution_contexts"
  on creative_execution_contexts for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

create policy "admins_can_insert_creative_execution_contexts"
  on creative_execution_contexts for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

-- Update policy permits admins to update at the RLS layer; the real
-- immutability boundary is enforced at the application/query layer
-- via the atomic WHERE status = 'DRAFT' guard on every UPDATE
-- statement, matching the established action_specifications
-- precedent.
create policy "admins_can_update_draft_creative_execution_contexts"
  on creative_execution_contexts for update
  using (is_workspace_member(workspace_id, 'admin'::workspace_role))
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));
