-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 20260830000001_action_specifications_authorization
-- Additive only. Does not rewrite any already-deployed migration.
--
-- Concrete Owner Authorization V1 slice.
--
-- Extends the action_specifications status check constraint to
-- support AUTHORIZED and DECLINED, alongside the existing DRAFT /
-- READY_FOR_OWNER_AUTHORIZATION / SUPERSEDED values from
-- 20260829000001_action_specifications.sql (not rewritten here).
--
-- Adds this table's OWN authorization provenance columns
-- (decided_at, decided_by) - deliberately separate from
-- action_proposals' own decided_at/decided_by, which represent
-- approval of the high-level proposal, not authorization of this
-- exact concrete action. Concrete authorization has its own
-- provenance, never overloaded onto the proposal's.
--
-- IMMUTABILITY: exactly the same atomic UPDATE...WHERE pattern
-- already proven for this table's own DRAFT->READY transition
-- (finalizeSpecification) and for action_proposals'
-- decideActionProposal/expireActionProposal - the application layer
-- gates every authorization/decline UPDATE by
-- WHERE status = 'READY_FOR_OWNER_AUTHORIZATION', so a race between
-- two decisions can never both succeed, and no function anywhere
-- can mutate an AUTHORIZED or DECLINED row's execution-relevant
-- fields afterward.
-- ============================================================

alter table action_specifications
  drop constraint action_specifications_status_check;

alter table action_specifications
  add constraint action_specifications_status_check
  check (status in ('DRAFT', 'READY_FOR_OWNER_AUTHORIZATION', 'AUTHORIZED', 'DECLINED', 'SUPERSEDED'));

alter table action_specifications
  add column decided_at timestamp with time zone,
  add column decided_by uuid references auth.users(id);
