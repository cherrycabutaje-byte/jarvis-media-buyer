-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 022_lifecycle_rpc_privilege_hardening
-- Privilege-only fix - no function body changes
--
-- EMERGENCY SECURITY REMEDIATION
--
-- Root cause, confirmed via direct ACL evidence (not inferred):
-- pg_default_acl for defaclrole = postgres, schema public, object
-- type 'f' (functions) automatically granted EXECUTE to anon,
-- authenticated, and service_role on every function postgres
-- created in the public schema, applied at CREATE FUNCTION time -
-- before any subsequent REVOKE/GRANT in the same migration ran.
-- Each prior migration's "revoke all ... from public" was genuinely
-- effective for the PUBLIC pseudo-role (confirmed: PUBLIC itself has
-- no default grant entry), but irrelevant here, since anon/
-- authenticated/service_role never received access THROUGH PUBLIC -
-- they received it directly, via this default-privilege mechanism.
--
-- Confirmed via direct, live anonymous HTTP testing (anon API key,
-- no session, no service-role key):
--   - claim_next_job(): HTTP 200, legitimate "no eligible job" result
--     - proven claimable given a real queued job.
--   - complete_job(): HTTP 400, code P0001, "Job ... not found" -
--     the function's own internal business logic executed fully.
--   - fail_job(): HTTP 400, code P0001, "Job ... not found" - same.
-- All three confirmed genuinely, anonymously executable, not merely
-- theoretically exposed.
--
-- Confirmed via direct codebase inspection: the Worker has never
-- used a service-role credential. src/lib/supabase/server.ts (the
-- only Supabase client used by every repository function, including
-- the entire Worker) uses NEXT_PUBLIC_SUPABASE_ANON_KEY exclusively,
-- via a real authenticated user's session cookies. No service-role
-- key exists anywhere in this codebase (confirmed via full-project
-- grep, zero matches). The intended caller for all four functions is
-- therefore the "authenticated" role, not "service_role".
--
-- This migration corrects:
-- 1. Default privileges for FUTURE functions created by postgres in
--    public - deny-by-default for anon, authenticated, AND
--    service_role, requiring every future function's migration to
--    explicitly grant only its intended role. (Per explicit
--    correction: authenticated was NOT safe to leave on default,
--    since that would silently expose every future function to
--    every logged-in user regardless of that function's own
--    migration's intent.)
-- 2. Existing privileges on the four already-created functions -
--    explicit revoke from public, anon, and service_role; explicit
--    grant to authenticated only.
--
-- Function bodies are entirely unchanged - this is a privilege-only
-- migration. No CREATE OR REPLACE FUNCTION statements appear below.
--
-- KNOWN RESIDUAL LIMITATION (not resolved by this migration, not in
-- scope for it): the database cannot currently distinguish the
-- trusted Worker from any other authenticated application user -
-- both use the same PostgreSQL "authenticated" role. After this
-- fix, anonymous exploitation is closed, but any authenticated user
-- could still directly invoke these lifecycle RPCs. This is a
-- separate, future hardening consideration, not addressed here.
-- ============================================================

-- ------------------------------------------------------------
-- Part 1: Existing function privileges - explicit, exact signatures
-- ------------------------------------------------------------

revoke all on function public.claim_next_job(text) from public;
revoke all on function public.claim_next_job(text) from anon;
revoke all on function public.claim_next_job(text) from service_role;
grant execute on function public.claim_next_job(text) to authenticated;

revoke all on function public.complete_job(uuid, job_status, jsonb) from public;
revoke all on function public.complete_job(uuid, job_status, jsonb) from anon;
revoke all on function public.complete_job(uuid, job_status, jsonb) from service_role;
grant execute on function public.complete_job(uuid, job_status, jsonb) to authenticated;

revoke all on function public.fail_job(uuid, text, boolean) from public;
revoke all on function public.fail_job(uuid, text, boolean) from anon;
revoke all on function public.fail_job(uuid, text, boolean) from service_role;
grant execute on function public.fail_job(uuid, text, boolean) to authenticated;

revoke all on function public.create_workspace_with_owner(text) from public;
revoke all on function public.create_workspace_with_owner(text) from anon;
revoke all on function public.create_workspace_with_owner(text) from service_role;
grant execute on function public.create_workspace_with_owner(text) to authenticated;

-- ------------------------------------------------------------
-- Part 2: Default privileges for FUTURE functions created by
-- postgres in the public schema - deny-by-default for every
-- application role. Every future function's own migration must
-- now explicitly grant execute to whichever role it actually
-- intends, with no automatic exposure to anon, authenticated, or
-- service_role.
-- ------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from service_role;