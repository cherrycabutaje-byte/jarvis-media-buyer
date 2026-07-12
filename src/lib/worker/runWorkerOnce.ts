import { claimNextJob, completeJob, failJob } from "@/lib/repositories/jobRepository"
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
 * appropriate provider, executes it, and - for text_generation only
 * in this slice - persists either success (completeJob) or failure
 * (failJob) depending on the provider's own finishReason/retryable
 * classification. failJob() atomically decides retry vs dead-letter
 * and computes backoff scheduling - the Worker does not make that
 * decision itself.
 *
 * image_generation remains unpersisted in this slice, unchanged.
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

      if (result.finishReason === "error") {
        const errorMessage = (result.providerMetadata?.error as string | undefined) ?? "Unknown provider error"
        const failResult = await failJob(job.id, errorMessage, result.retryable)
        if (failResult.error) {
          log(`[worker] failed to persist job failure: ${failResult.error}`, true)
        } else {
          log(`[worker] job ${job.id} failure persisted - status: ${failResult.data?.status}`)
        }
      } else {
        const completeResult = await completeJob(job.id, "succeeded", {
          rawText: result.rawText,
          finishReason: result.finishReason,
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        })
        if (completeResult.error) {
          log(`[worker] failed to persist job completion: ${completeResult.error}`, true)
        } else {
          log(`[worker] job ${job.id} completed and persisted - status: succeeded`)
        }
      }
    } else if (job.job_type === "image_generation") {
      const prompt = job.payload as unknown as ImagePromptObject
      log(`[worker] deserialized ImagePromptObject - style: ${prompt.style}, quality: ${prompt.quality}`)

      const provider = resolveImageProvider()
      log(`[worker] resolved provider: ${provider.providerName}`)

      const result = await provider.execute(prompt)
      log(`[worker] provider execution complete - finishReason: ${result.finishReason}, imageData: ${result.imageData}`)
      log(`[worker] job ${job.id} - Provider execution completed. Job remains in 'processing' pending later slices.`)
    } else {
      log(`[worker] job_type "${job.job_type}" has no provider resolution defined yet in this slice`)
    }
  } catch (err) {
    log(`[worker] failed during processing: ${err instanceof Error ? err.message : String(err)}`, true)
    return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
  }

  return { claimed: true, jobId: job.id, jobType: job.job_type, logLines }
}