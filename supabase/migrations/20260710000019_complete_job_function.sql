-- ============================================================
-- JARVIS Platform Foundation
-- Migration: 019_complete_job_function
-- Additive - new SECURITY DEFINER function only, no schema change
--
-- Same reasoning as migration 018's claim_next_job(): completing a
-- job is a trusted Worker operation, not ordinary authenticated-user
-- CRUD - there is no single "acting user" whose workspace membership
-- applies, since a Worker may complete jobs across many workspaces.
-- Confirmed via pg_policies inspection that jobs has no UPDATE
-- policy of any kind before writing this.
--
-- Designed as a general business operation (accepts p_status) rather
-- than a success-only helper, even though this slice only ever calls
-- it with 'succeeded' - this avoids a second migration when
-- failed/retrying/dead_letter transitions are implemented in a
-- future slice.
--
-- Narrowly scoped, matching claim_next_job()'s discipline exactly:
-- persists only result, status, and completed_at on one specific
-- job (by id). Does not touch locked_by or locked_at - those remain
-- exactly as claim_next_job() set them, since completion is not a
-- re-claim.
-- ============================================================

create or replace function complete_job(
  p_job_id uuid,
  p_status job_status,
  p_result jsonb
)
returns jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs;
begin
  update jobs
  set status = p_status,
      result = p_result,
      completed_at = now()
  where id = p_job_id
  returning * into v_job;

  if v_job.id is null then
    raise exception 'Job % not found', p_job_id;
  end if;

  return v_job;
end;
$$;

revoke all on function complete_job(uuid, job_status, jsonb) from public;
grant execute on function complete_job(uuid, job_status, jsonb) to authenticated;