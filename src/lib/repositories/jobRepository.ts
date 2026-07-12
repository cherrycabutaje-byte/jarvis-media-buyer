import { createClient } from "@/lib/supabase/server"

export type JobType = "text_generation" | "image_generation" | "video_generation" | "asset_assembly" | "publish_asset"
export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "retrying" | "dead_letter"

export interface Job {
  id: string
  workspace_id: string
  product_id: string | null
  variation_id: string | null
  job_type: JobType
  status: JobStatus
  priority: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  attempt_count: number
  max_attempts: number
  last_error: string | null
  credits_reserved: number
  idempotency_key: string
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  locked_by: string | null
  locked_at: string | null
  created_at: string
}

export interface JobTypePolicy {
  max_attempts: number
  timeout_seconds: number
  base_backoff_seconds: number
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const JOB_COLUMNS =
  "id, workspace_id, product_id, variation_id, job_type, status, priority, payload, result, attempt_count, max_attempts, last_error, credits_reserved, idempotency_key, scheduled_at, started_at, completed_at, locked_by, locked_at, created_at"

export async function getJobTypePolicy(jobType: JobType): Promise<RepositoryResult<JobTypePolicy>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("job_type_policies")
    .select("max_attempts, timeout_seconds, base_backoff_seconds")
    .eq("job_type", jobType)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as JobTypePolicy, error: null }
}

export async function createJob(params: {
  workspaceId: string
  productId: string
  jobType: JobType
  priority: number
  payload: Record<string, unknown>
  maxAttempts: number
  idempotencyKey: string
}): Promise<RepositoryResult<Job>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      workspace_id: params.workspaceId,
      product_id: params.productId,
      job_type: params.jobType,
      priority: params.priority,
      payload: params.payload,
      max_attempts: params.maxAttempts,
      idempotency_key: params.idempotencyKey,
    })
    .select(JOB_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Job, error: null }
}

export async function claimNextJob(lockedBy: string): Promise<RepositoryResult<Job | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("claim_next_job", { p_locked_by: lockedBy })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data as Job | null) ?? null, error: null }
}

/**
 * ADDITIVE (Provider Result Persistence slice): completes a job by
 * persisting its result, status, and completed_at atomically via
 * the complete_job() SECURITY DEFINER function (migration 019).
 *
 * A business operation, not a generic update - matches the intent
 * established by claimNextJob(). Designed to accept any JobStatus
 * (not just "succeeded") so future failed/retrying/dead_letter
 * transitions can reuse this same function without a new migration.
 *
 * Does NOT touch locked_by or locked_at - those remain exactly as
 * claimNextJob() set them, confirmed via real database testing
 * before this function was written.
 */
export async function completeJob(
  jobId: string,
  status: JobStatus,
  result: Record<string, unknown>
): Promise<RepositoryResult<Job>> {
  const supabase = await createClient()
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