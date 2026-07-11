"use server"

import { createClient } from "@/lib/supabase/server"
import { getProductById } from "@/lib/repositories/productRepository"
import { getBrainRunById } from "@/lib/repositories/brainRunRepository"
import { createJob, getJobTypePolicy, type Job } from "@/lib/repositories/jobRepository"
import { runProductStructureEngine } from "@/lib/builder/runProductStructureEngine"
import { runPackageDefinitionEngine } from "@/lib/builder/runPackageDefinitionEngine"
import { runDecisionEngine } from "@/lib/builder/runDecisionEngine"
import { runPromptBuilder } from "@/lib/builder/runPromptBuilder"
import { runCreativeAssetBuilder } from "@/lib/builder/runCreativeAssetBuilder"
import { runImagePromptBuilder } from "@/lib/builder/runImagePromptBuilder"
import { computeJobIdempotencyKey } from "@/lib/jobs/computeJobIdempotencyKey"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"

export interface CreateJobResult {
  success: boolean
  data: Job | null
  error: string | null
}

const PRIORITY_BY_JOB_TYPE: Record<"text_generation" | "image_generation", number> = {
  text_generation: 100,
  image_generation: 200,
}

/**
 * Server Action: creates one queued job for a product, using the
 * already-validated Builder chain to produce the job's payload.
 *
 * PERMANENT QUEUE CONTRACT (fixed after a genuine defect was found
 * in Worker Execution testing): jobs.payload stores the executable
 * artifact itself - the bare ProviderPrompt or ImagePromptObject
 * (i.e. .findings) - NOT the Builder wrapper
 * (IntelligenceModuleResult<T>, with module/status/confidence/
 * evidence/unknowns/recommendationsForNext). The Worker deserializes
 * directly into ProviderPrompt/ImagePromptObject with no knowledge
 * of Builder wrapper types - this is the boundary: Builder Layer
 * concerns (confidence, evidence, etc.) stay inside the Builder
 * Layer's own execution, they are never persisted onto the queue.
 *
 * Executes no new business logic - only orchestrates the existing,
 * frozen, individually-validated pure functions (Modules 11-16),
 * exactly as before. Only the shape of what gets persisted changed.
 */
export async function createJobAction(
  productId: string,
  jobType: "text_generation" | "image_generation"
): Promise<CreateJobResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to create a job." }
  }

  if (!productId) {
    return { success: false, data: null, error: "A product is required." }
  }

  const productResult = await getProductById(productId)
  if (productResult.error || !productResult.data) {
    return { success: false, data: null, error: productResult.error ?? "Product not found." }
  }
  const product = productResult.data

  const brainRunResult = await getBrainRunById(product.brain_run_id)
  if (brainRunResult.error || !brainRunResult.data) {
    return { success: false, data: null, error: brainRunResult.error ?? "Brain run not found." }
  }

  const pipeline = brainRunResult.data.intelligence_pipeline as unknown as BrainPipelineOutput

  let payload: Record<string, unknown>
  try {
    const productStructureResult = runProductStructureEngine(pipeline)
    const packageDefinitionResult = runPackageDefinitionEngine(productStructureResult)
    const decisionRecordResult = runDecisionEngine(pipeline, productStructureResult, packageDefinitionResult)

    if (jobType === "text_generation") {
      const providerPromptResult = runPromptBuilder(pipeline, decisionRecordResult)
      payload = providerPromptResult.findings as unknown as Record<string, unknown>
    } else {
      const creativeAssetResult = runCreativeAssetBuilder(pipeline, decisionRecordResult)
      const imagePromptResult = runImagePromptBuilder(creativeAssetResult.findings, decisionRecordResult)
      payload = imagePromptResult.findings as unknown as Record<string, unknown>
    }
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "The Builder pipeline failed to execute.",
    }
  }

  const policyResult = await getJobTypePolicy(jobType)
  if (policyResult.error || !policyResult.data) {
    return { success: false, data: null, error: policyResult.error ?? "No job type policy found for this job type." }
  }

  const recommendedVariationId = pipeline.campaignIntelligence.findings.recommendedVariation
  const idempotencyKey = computeJobIdempotencyKey(productId, jobType, recommendedVariationId)

  const result = await createJob({
    workspaceId: product.workspace_id,
    productId,
    jobType,
    priority: PRIORITY_BY_JOB_TYPE[jobType],
    payload,
    maxAttempts: policyResult.data.max_attempts,
    idempotencyKey,
  })

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}