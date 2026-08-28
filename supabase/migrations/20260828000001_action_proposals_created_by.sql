-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260828000001_action_proposals_created_by
-- Additive only. Does not rewrite the already-deployed
-- 20260827000001_action_proposals.sql migration.
--
-- Closure finding: action_proposals recorded WHO decided a proposal
-- (decided_by) but never WHO/WHAT created it in the first place -
-- an incomplete audit trail. This adds created_by, nullable (since
-- it is genuinely unknown for any row created before this column
-- existed, though in practice no such rows exist yet since this
-- table was created in the same slice).
-- ============================================================

alter table action_proposals
  add column created_by uuid references auth.users(id);
