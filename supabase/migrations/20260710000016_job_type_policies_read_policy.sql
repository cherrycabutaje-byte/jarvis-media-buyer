-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 016_job_type_policies_read_policy
-- Additive fix - genuine RLS policy gap, not an architectural defect
--
-- Migration 011 (security hardening) correctly enabled RLS on
-- job_type_policies along with every other previously-unprotected
-- table, but no SELECT policy was ever added for it. With RLS
-- enabled and zero policies, the table is invisible to every
-- non-superuser role for every operation - the 5 seeded rows
-- (migration 015) genuinely exist but could not be read by any
-- authenticated application user, only by the postgres superuser
-- (e.g. via the SQL Editor, which bypasses RLS entirely).
--
-- This was discovered as a real, reproducible defect during
-- Provider Adapter Slice 1 (First Job Creation): createJobAction's
-- call to getJobTypePolicy() returned zero rows as an authenticated
-- user, causing "Cannot coerce the result to a single JSON object"
-- from .single(), and blocking job creation entirely.
--
-- Fix mirrors the confirmed, real, existing pattern already used for
-- other read-only platform reference tables - verified directly
-- against the live database's pg_policies before writing this:
--
--   action_costs        -> authenticated_can_view_action_costs
--   learning_insights    -> authenticated_can_view_learning_insights
--   plans                -> authenticated_can_view_plans
--
-- All three use: for select using (true) - unrestricted read access
-- for any authenticated user, since these are platform-wide
-- configuration/reference tables with no tenant-specific or
-- sensitive content. job_type_policies is the same category of
-- table, so this policy is defined identically. No INSERT, UPDATE,
-- or DELETE policy is added - this table remains read-only from the
-- application's perspective, exactly like its siblings.
-- ============================================================

create policy "authenticated_can_view_job_type_policies"
  on job_type_policies for select
  using (true);