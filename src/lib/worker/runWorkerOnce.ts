import { claimNextJob } from "@/lib/repositories/jobRepository"
import type { ProviderPrompt, ImagePromptObject } from "@/lib/jarvis-brain/types"

export interface WorkerRunResult {
  claimed: boolean
  jobId: string | null
  jobType: string | null
  logLines: string[]
}

/**
 * Runs one worker cycle: claims the next eligible job via
 * claim_next_job() (migration 018), deserializes its payload, and
 * logs the lifecycle. Stops immediately after - does NOT execute
 * any provider call (Claude/OpenAI/Gemini/DeepSeek/image), does not
 * create any asset, does not implement retry or dead-letter
 * handling, and does not transition the job beyond 'processing'.
 * All of that belongs to later slices.
 *
 * Deliberately separated from its Server Action trigger - a future
 * real background worker process will need to call this same
 * claiming+processing logic outside of a browser-triggered Next.js
 * request, not duplicate it.
 */
export async function runWorkerOnce(workerId: string): Promise<WorkerRunResult> {
  const logLines: string[] = []

  function log(line: string, isError = false) {
    logLines.push(line)
    if (isError) {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  const claimResult = await claimNextJob(workerId)
  if (claimResult.error) {
    log(`[worker] claim_next_job failed: ${claimResult.error}`, true)
    return { claimed: false, jobId: null, jobType: null, logLines }
  }

  const job = claimResult.data
  if (!job) {
    log("[worker] no eligible job found - queue is empty")
    return { claimed: false, jobId: null, jobType: null, logLines }
  }

  log(`[worker] claimed job ${job.id} (type: ${job.job_type}, priority: ${job.priority})`)

  try {
    if (job.job_type === "text_generation") {
      const prompt = job.payload as unknown as ProviderPrompt
      log(
        `[worker] deserialized ProviderPrompt - expectedDeliverables: ${prompt.expectedDeliverables.join(", ")}`
      )
    } else if (job.job_type === "image_generation") {
      const prompt = job.payload as unknown as ImagePromptObject
      log(`[worker] deserialized ImagePromptObject - style: ${prompt.style}, quality: ${prompt.quality}`)
    } else {
      log(`[worker] job_type "${job.job_type}" has no local processing defined yet in this slice`)
    }
  } catch (err) {
    log(`[worker] failed to deserialize payload: ${err instanceof Error ? err.message : String(err)}`, true)
    return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
  }

  log(
    `[worker] job ${job.id} processed locally - no provider call made, job remains in 'processing' pending later slices`
  )

  return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
}