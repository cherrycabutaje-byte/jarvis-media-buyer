import { createWorkerClient } from "@/lib/supabase/worker"
import type { Job, JobStatus, RepositoryResult } from "@/lib/repositories/jobRepository"

/**
 * Worker-exclusive job lifecycle repository (Authenticated Worker
 * RPC Isolation slice). Contains claimNextJob/completeJob/failJob,
 * copied exactly from jobRepository.ts, with the ONLY change being
 * the Supabase client source: createWorkerClient() (the trusted,
 * elevated, service_role-authenticated client) instead of the
 * human-session createClient(). Input types, return types, RPC
 * names, error normalization, and status/result handling are all
 * unchanged - no business logic is duplicated or rewritten here,
 * only re-hosted under the trusted machine identity.
 *
 * getJobTypePolicy, createJob, and getJobById remain in
 * jobRepository.ts, unmoved - they are legitimately called under
 * ordinary human authenticated sessions (job creation, asset
 * creation flows) and have no relationship to Worker exclusivity.
 */

export async function claimNextJob(lockedBy: string): Promise<RepositoryResult<Job | null>> {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc("claim_next_job", { p_locked_by: lockedBy })

  if (error) {
    return { data: null, error: error.message }
  }

  // PostgREST serializes claim_next_job's SQL NULL (RETURNS jobs,
  // a single composite type) as a fully-keyed JSON object with every
  // field null - {"id": null, "workspace_id": null, ...} - not as a
  // bare JSON null. This normalizes that shape back to the
  // application contract (Job | null). id can never be null on a
  // genuine job row (jobs.id is a non-null primary key, and the
  // Job type declares id: string, never string | null), so it is
  // the correct, minimal discriminator - not a broad "all fields
  // null" heuristic.
  if (data && (data as { id: string | null }).id === null) {
    return { data: null, error: null }
  }

  return { data: (data as Job | null) ?? null, error: null }
}

export async function completeJob(
  jobId: string,
  status: JobStatus,
  result: Record<string, unknown>
): Promise<RepositoryResult<Job>> {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc("complete_job", {
    p_job_id: jobId,
    p_status: status,
    p_result: result,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Job, error: null }
}

export async function failJob(
  jobId: string,
  error: string,
  retryable: boolean
): Promise<RepositoryResult<Job>> {
  const supabase = createWorkerClient()
  const { data, error: rpcError } = await supabase.rpc("fail_job", {
    p_job_id: jobId,
    p_error: error,
    p_retryable: retryable,
  })

  if (rpcError) {
    return { data: null, error: rpcError.message }
  }
  return { data: data as Job, error: null }
}