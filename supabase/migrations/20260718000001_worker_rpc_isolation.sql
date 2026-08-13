-- ============================================================
-- JARVIS Platform Foundation
-- Migration: worker_rpc_isolation
-- Privilege-only - no function body changes
--
-- Authenticated Worker RPC Isolation slice. Restricts the three
-- lifecycle RPCs - claim_next_job, complete_job, fail_job - to the
-- trusted, elevated service_role identity only, closing the gap
-- named explicitly (and deliberately deferred) in migration 022's
-- own header: "the database cannot currently distinguish the
-- trusted Worker from any other authenticated application user."
--
-- BACKGROUND: this project has no separate Worker process today.
-- Every Worker cycle has run as whichever human happened to be
-- logged into the browser, via src/lib/supabase/server.ts's
-- cookie-based, anon-key-authenticated client. This migration is
-- the database-side half of a larger vertical slice that also adds
-- a genuinely separate, elevated Worker Supabase client
-- (src/lib/supabase/worker.ts, using SUPABASE_SECRET_KEY -> the
-- service_role role) and a dedicated Worker repository
-- (workerJobRepository.ts) - both already created, reviewed, and
-- validated end-to-end against the real local database (including
-- a pre-migration test proving the elevated client correctly
-- receives "permission denied" under the CURRENT, unmigrated grants
-- - i.e. proving the machine trust path reaches the database
-- correctly, with only the grant itself still missing).
--
-- EXPLICIT REVOKE FORM: per established project convention
-- (matching migration 022 exactly), this migration explicitly
-- revokes from PUBLIC, anon, AND authenticated before granting
-- service_role - even though anon and PUBLIC are already absent
-- from the current ACL (confirmed via direct inspection immediately
-- before writing this migration) - so the final intended ACL is
-- unambiguous and self-documenting, not dependent on inferring the
-- current state from a prior migration's history.
--
-- Function bodies, owner (postgres), SECURITY DEFINER status, and
-- search_path (public) are entirely unchanged - this migration
-- contains no CREATE OR REPLACE FUNCTION statement for any of the
-- three functions.
--
-- RESULTING INVARIANT:
--   ordinary authenticated human -> claim_next_job/complete_job/
--     fail_job -> DENIED (42501)
--   trusted machine client (SUPABASE_SECRET_KEY -> service_role) ->
--     claim_next_job/complete_job/fail_job -> ALLOWED
--
-- Exact signatures used below, confirmed via direct query against
-- the real local database immediately before writing this file:
--   claim_next_job(text)
--   complete_job(uuid, job_status, jsonb)
--   fail_job(uuid, text, boolean)
-- ============================================================

revoke execute on function public.claim_next_job(text) from public;
revoke execute on function public.claim_next_job(text) from anon;
revoke execute on function public.claim_next_job(text) from authenticated;
grant execute on function public.claim_next_job(text) to service_role;

revoke execute on function public.complete_job(uuid, job_status, jsonb) from public;
revoke execute on function public.complete_job(uuid, job_status, jsonb) from anon;
revoke execute on function public.complete_job(uuid, job_status, jsonb) from authenticated;
grant execute on function public.complete_job(uuid, job_status, jsonb) to service_role;

revoke execute on function public.fail_job(uuid, text, boolean) from public;
revoke execute on function public.fail_job(uuid, text, boolean) from anon;
revoke execute on function public.fail_job(uuid, text, boolean) from authenticated;
grant execute on function public.fail_job(uuid, text, boolean) to service_role;