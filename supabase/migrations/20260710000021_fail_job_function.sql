-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 021_fail_job_function
-- Additive - new SECURITY DEFINER function only, no schema change
--
-- Same reasoning as claim_next_job() and complete_job(): failing a
-- job is a trusted Worker operation, not ordinary authenticated-user
-- CRUD. The retry-vs-dead-letter decision is made entirely inside
-- this function, in the same statement as the update, so the
-- Worker never reads attempt_count or max_attempts directly and
-- there is no read-then-write race between concurrent failures of
-- the same job.
--
-- Decision matrix:
--   p_retryable = false                          -> dead_letter immediately
--   p_retryable = true, attempt_count < max       -> retrying, scheduled_at
--                                                    pushed forward by
--                                                    base_backoff_seconds * 2^(attempt-1)
--   p_retryable = true, attempt_count >= max       -> dead_letter
--
-- Backoff formula is a reasonable engineering default (standard
-- exponential backoff), not sourced from any prior design document -
-- unlike the base_backoff_seconds values themselves, which were
-- sourced from the original Component 5 validation history.
-- ============================================================

create or replace function fail_job(
  p_job_id uuid,
  p_error text,
  p_retryable boolean
)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
  v_new_attempt_count integer;
  v_max_attempts integer;
  v_backoff_seconds integer;
begin
  select attempt_count + 1, max_attempts
  into v_new_attempt_count, v_max_attempts
  from jobs where id = p_job_id;

  if v_new_attempt_count is null then
    raise exception 'Job % not found', p_job_id;
  end if;

  select coalesce(jtp.base_backoff_seconds, 1) into v_backoff_seconds
  from jobs j join job_type_policies jtp on jtp.job_type = j.job_type
  where j.id = p_job_id;

  update jobs
  set attempt_count = v_new_attempt_count,
      last_error = p_error,
      status = case
        when not p_retryable then 'dead_letter'::job_status
        when v_new_attempt_count >= v_max_attempts then 'dead_letter'::job_status
        else 'retrying'::job_status
      end,
      scheduled_at = case
        when not p_retryable then scheduled_at
        when v_new_attempt_count >= v_max_attempts then scheduled_at
        else now() + (v_backoff_seconds * power(2, v_new_attempt_count - 1)) * interval '1 second'
      end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function fail_job(uuid, text, boolean) from public;
grant execute on function fail_job(uuid, text, boolean) to authenticated;