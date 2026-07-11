-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 018_claim_next_job_function
-- Additive - new SECURITY DEFINER function only, no schema change
--
-- The Worker is a trusted infrastructure component, not an
-- authenticated human performing ordinary CRUD - job claiming is a
-- transactional, system-level operation (SELECT ... FOR UPDATE SKIP
-- LOCKED, status transition, lock acquisition, concurrency control)
-- that is not appropriately modeled as a general UPDATE RLS policy.
-- This mirrors the same reasoning already applied to migration 013's
-- create_workspace_with_owner() - a narrowly-scoped SECURITY DEFINER
-- function for one specific, trusted, system-level operation, not a
-- broad grant of UPDATE capability on the table.
--
-- This function does exactly one thing: atomically claim the single
-- next eligible job (status queued or retrying, ordered by the
-- existing idx_jobs_claimable partial index's own ordering:
-- priority, scheduled_at), transition it to processing, populate
-- locked_by/locked_at/started_at, and return the claimed row. It
-- exposes no arbitrary UPDATE capability - callers cannot update any
-- other field, any other job, or any other status transition through
-- this function. Retry/backoff/dead-letter logic, provider
-- execution, and the queue's own design are all untouched.
-- ============================================================

create or replace function claim_next_job(p_locked_by text)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
begin
  select * into v_job
  from jobs
  where status in ('queued', 'retrying')
  order by priority, scheduled_at
  for update skip locked
  limit 1;

  if v_job.id is null then
    return null;
  end if;

  update jobs
  set status = 'processing',
      locked_by = p_locked_by,
      locked_at = now(),
      started_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function claim_next_job(text) from public;
grant execute on function claim_next_job(text) to authenticated;