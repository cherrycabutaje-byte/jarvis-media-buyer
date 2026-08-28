-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260827000001_action_proposals
-- Additive only.
--
-- Action Proposal V1 slice.
--
-- Persistence is genuinely necessary here (unlike every prior layer
-- in this pipeline, which recomputes on demand): an owner must be
-- able to review and decide on a proposal asynchronously, after the
-- moment it was generated. guardrail_decision/guardrail_reasons
-- store the REAL evaluateProposedMediaAction() output verbatim -
-- never re-derived at read time. status defaults to
-- PENDING_OWNER_REVIEW and is NEVER set to APPROVED by this
-- migration or any default - only an explicit owner decision (via
-- the Server Action layer) can transition it.
-- ============================================================

create table action_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  solution_candidate_code text not null,
  solution_candidate_label text not null,
  category text not null,
  rationale text not null,
  primary_mechanism text,
  supported_by jsonb not null default '[]'::jsonb,
  estimated_risk text not null,
  estimated_cost_cents integer,
  reversibility text not null,
  guardrail_decision text not null,
  guardrail_reasons jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING_OWNER_REVIEW' check (status in ('PENDING_OWNER_REVIEW', 'APPROVED', 'DECLINED', 'EXPIRED')),
  created_at timestamp with time zone not null default now(),
  decided_at timestamp with time zone,
  decided_by uuid references auth.users(id)
);

create index idx_action_proposals_brand on action_proposals(brand_id);
create index idx_action_proposals_workspace on action_proposals(workspace_id);
create index idx_action_proposals_status on action_proposals(status);

alter table action_proposals enable row level security;

create policy "members_can_view_action_proposals"
  on action_proposals for select
  using (is_workspace_member(workspace_id, 'viewer'::workspace_role));

create policy "admins_can_insert_action_proposals"
  on action_proposals for insert
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));

-- Update policy exists ONLY so an explicit owner decision
-- (approve/decline) can be recorded - the Server Action layer is the
-- sole caller, and it never sets status to anything other than
-- APPROVED or DECLINED via this path, and never touches a proposal
-- that is not still PENDING_OWNER_REVIEW.
create policy "admins_can_decide_action_proposals"
  on action_proposals for update
  using (is_workspace_member(workspace_id, 'admin'::workspace_role))
  with check (is_workspace_member(workspace_id, 'admin'::workspace_role));
