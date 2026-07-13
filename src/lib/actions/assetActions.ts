"use server"

import { createClient } from "@/lib/supabase/server"
import { getJobById } from "@/lib/repositories/jobRepository"
import { getProductById } from "@/lib/repositories/productRepository"
import { getBrainRunById } from "@/lib/repositories/brainRunRepository"
import { hasExistingAsset, createFirstAsset, type Asset } from "@/lib/repositories/assetRepository"

export interface CreateFirstAssetResult {
  success: boolean
  data: Asset | null
  error: string | null
}

/**
 * Server Action: creates the first asset (version_number = 1) for a
 * product, from one succeeded text_generation job's result.
 *
 * Validates, in order, exactly per the approved slice scope:
 * job exists -> status = succeeded -> job_type = text_generation ->
 * result populated -> job.product_id matches the target product ->
 * product exists -> product has no existing asset (this slice does
 * NOT support regeneration/versioning - a clear error is returned
 * instead of computing MAX(version_number)+1).
 *
 * architecture_version is inherited through the real provenance
 * chain (job -> product -> brain_run -> architecture_version), not
 * hardcoded - matching the explicit instruction to avoid another
 * hardcoded architecture-version constant.
 */
export async function createFirstAssetFromJobAction(
  jobId: string,
  productId: string
): Promise<CreateFirstAssetResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in." }
  }

  if (!jobId || !productId) {
    return { success: false, data: null, error: "Job ID and Product ID are required." }
  }

  const jobResult = await getJobById(jobId)
  if (jobResult.error || !jobResult.data) {
    return { success: false, data: null, error: jobResult.error ?? "Job not found." }
  }
  const job = jobResult.data

  if (job.status !== "succeeded") {
    return { success: false, data: null, error: `Job status is "${job.status}", expected "succeeded".` }
  }
  if (job.job_type !== "text_generation") {
    return { success: false, data: null, error: `Job type is "${job.job_type}", expected "text_generation".` }
  }
  if (!job.result) {
    return { success: false, data: null, error: "Job has no result to persist." }
  }
  if (job.product_id !== productId) {
    return { success: false, data: null, error: "This job does not belong to the specified product." }
  }

  const productResult = await getProductById(productId)
  if (productResult.error || !productResult.data) {
    return { success: false, data: null, error: productResult.error ?? "Product not found." }
  }
  const product = productResult.data

  const existingAssetResult = await hasExistingAsset(productId)
  if (existingAssetResult.error) {
    return { success: false, data: null, error: existingAssetResult.error }
  }
  if (existingAssetResult.data) {
    return {
      success: false,
      data: null,
      error:
        "This product already has an asset. Regeneration and versioning are not supported by this slice - they belong to a future one.",
    }
  }

  const brainRunResult = await getBrainRunById(product.brain_run_id)
  if (brainRunResult.error || !brainRunResult.data) {
    return { success: false, data: null, error: brainRunResult.error ?? "Brain run not found." }
  }

  const createResult = await createFirstAsset({
    productId,
    architectureVersion: brainRunResult.data.architecture_version,
    assetPayload: job.result,
    assembledByJobId: job.id,
  })

  if (createResult.error) {
    return { success: false, data: null, error: createResult.error }
  }

  return { success: true, data: createResult.data, error: null }
}