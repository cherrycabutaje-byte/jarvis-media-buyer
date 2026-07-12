-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 020_claim_next_job_honors_scheduled_at
-- Additive fix - completes the original design, not a redesign
--
-- Genuine pre-existing gap discovered while planning Job Failure &
-- Retry Handling: claim_next_job() (migration 018) has never
-- filtered on scheduled_at. This was never a problem until now,
-- because no code has ever set a job to 'retrying' with a future
-- scheduled_at - the 'retrying' status and backoff scheduling exist
-- in the schema (migration 006) but were never exercised until this
-- feature. Without this fix, a 'retrying' job would be immediately
-- reclaimable the instant fail_job() sets it, regardless of its
-- computed backoff delay - making backoff timing calculated and
-- stored correctly, but never actually enforced.
--
-- This is a backward-compatible completion of the original design,
-- not a behavior change to the already-validated queued-job path:
-- queued jobs are always created with scheduled_at = now() (the
-- column's own default), so "scheduled_at <= now()" is true for
-- them immediately and always has been. Only the 'retrying' path -
-- which has never been exercised by any validated behavior before
-- this feature - is newly, correctly restricted.
--
-- No other change: same SELECT ... FOR UPDATE SKIP LOCKED
-- mechanism, same ordering (priority, scheduled_at), same update of
-- status/locked_by/locked_at/started_at.
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
    and scheduled_at <= now()
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