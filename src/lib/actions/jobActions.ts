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

/**
 * Priority values sourced from the original Component 5 (Job Queue)
 * validation testing - text before image, matching Decision
 * Engine's established execution order (lower number = higher
 * priority). Not invented for this slice.
 */
const PRIORITY_BY_JOB_TYPE: Record<"text_generation" | "image_generation", number> = {
  text_generation: 100,
  image_generation: 200,
}

/**
 * Server Action: creates one queued job for a product, using the
 * already-validated Builder chain to produce the job's payload
 * (a ProviderPrompt for text, an ImagePromptObject for image).
 *
 * This is queue insertion ONLY. No worker, no SKIP LOCKED claiming,
 * no provider resolution, no provider call (mock or real), no
 * asset creation, no publishing - those all belong to later,
 * separate slices.
 *
 * Executes no new business logic - only orchestrates the existing,
 * frozen, individually-validated pure functions (Modules 11-16),
 * exactly as builderActions.ts already does for persistence.
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
      payload = providerPromptResult as unknown as Record<string, unknown>
    } else {
      const creativeAssetResult = runCreativeAssetBuilder(pipeline, decisionRecordResult)
      const imagePromptResult = runImagePromptBuilder(creativeAssetResult.findings, decisionRecordResult)
      payload = imagePromptResult as unknown as Record<string, unknown>
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