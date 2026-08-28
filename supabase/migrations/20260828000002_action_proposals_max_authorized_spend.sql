-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260828000002_action_proposals_max_authorized_spend
-- Additive only. Does not rewrite any already-deployed migration.
--
-- CTO closure fix: the previous implementation submitted the
-- owner's own maxTestBudgetCents ceiling to the Risk Guard AS IF it
-- were the proposed spend, making the guardrail check trivially
-- always ALLOWED. The fix (application-layer, see
-- src/lib/product/actionProposal.ts) always proposes a null spend
-- in V1 (no independent spend-sizing rule exists) and preserves the
-- owner's ceiling SEPARATELY, for display only. This column stores
-- that ceiling value on the persisted proposal - never fed back
-- into any Risk Guard evaluation at read time.
-- ============================================================

alter table action_proposals
  add column max_authorized_spend_cents integer;
