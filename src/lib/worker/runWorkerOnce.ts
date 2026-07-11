import { claimNextJob } from "@/lib/repositories/jobRepository"
import { resolveTextProvider, resolveImageProvider } from "@/lib/providers/resolveProvider"
import type { ProviderPrompt, ImagePromptObject } from "@/lib/jarvis-brain/types"

export interface WorkerRunResult {
  claimed: boolean
  jobId: string | null
  jobType: string | null
  logLines: string[]
}

/**
 * Runs one worker cycle: claims the next eligible job, resolves the
 * appropriate provider via the registry (resolveTextProvider /
 * resolveImageProvider - the Worker no longer knows how providers
 * are selected, only that it can ask for one), executes it, and
 * logs the mock result. Stops immediately after - no asset
 * persistence, no retry/dead-letter handling, no publishing, and
 * still no real external API call - the resolved provider is always
 * a mock in this slice. All of that belongs to later slices.
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
      log(`[worker] deserialized ProviderPrompt - expectedDeliverables: ${prompt.expectedDeliverables.join(", ")}`)

      const provider = resolveTextProvider()
      log(`[worker] resolved provider: ${provider.providerName}`)

      const result = await provider.execute(prompt)
      log(`[worker] provider execution complete - finishReason: ${result.finishReason}, rawText: ${result.rawText}`)
    } else if (job.job_type === "image_generation") {
      const prompt = job.payload as unknown as ImagePromptObject
      log(`[worker] deserialized ImagePromptObject - style: ${prompt.style}, quality: ${prompt.quality}`)

      const provider = resolveImageProvider()
      log(`[worker] resolved provider: ${provider.providerName}`)

      const result = await provider.execute(prompt)
      log(`[worker] provider execution complete - finishReason: ${result.finishReason}, imageData: ${result.imageData}`)
    } else {
      log(`[worker] job_type "${job.job_type}" has no provider resolution defined yet in this slice`)
    }
  } catch (err) {
    log(`[worker] failed during processing: ${err instanceof Error ? err.message : String(err)}`, true)
    return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
  }

  log(
    `[worker] job ${job.id} processed locally with a mock provider - job remains in 'processing' pending later slices`
  )

  return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
}