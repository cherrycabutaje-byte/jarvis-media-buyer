/**
 * Master Product Asset V1
 *
 * ARCHITECTURAL NOTE:
 * Pure, deterministic module. Determines whether a specific,
 * already-uploaded creative_assets row is ELIGIBLE to become the
 * product's Master Product Asset - it does not generate, improve,
 * or alter any image. If quality is insufficient, this honestly
 * reports IMPROVEMENT_REQUIRED rather than pretending an improvement
 * happened (Step 7's explicit requirement) - no image-improvement
 * capability exists yet, and this module never claims otherwise.
 *
 * OWNERSHIP (Cases F/G): eligibility requires the asset's
 * product_id and workspace_id to exactly match the target product/
 * workspace - a structural guarantee, not a confidence heuristic,
 * matching the same discipline already established in the Hybrid
 * Decision Engine.
 *
 * PRESERVATION (Step 14): promoting an asset to master only ever
 * sets is_master = true on the EXISTING row - it never creates a
 * modified copy or overwrites the original file. The original
 * customer upload is always what "master" points to; a future
 * image-improvement capability can attach an improved derivative
 * without this module needing to change.
 */

import { assessImageQuality, type ImageQualityResult } from "@/lib/product/imageQualityGate"

export type MasterEligibility = "ELIGIBLE" | "IMPROVEMENT_REQUIRED" | "NOT_ELIGIBLE"

export interface MasterEligibilityResult {
  eligibility: MasterEligibility
  qualityResult: ImageQualityResult
  reasons: string[]
}

export interface EvaluateMasterEligibilityInput {
  asset: {
    id: string
    productId: string | null
    workspaceId: string
    category: string
    mimeType: string
    widthPx: number | null
    heightPx: number | null
    fileSizeBytes: number
  }
  context: {
    productId: string
    workspaceId: string
  }
}

const ELIGIBLE_CATEGORIES = ["product_image", "product_in_use"]

export function evaluateMasterEligibility(input: EvaluateMasterEligibilityInput): MasterEligibilityResult {
  const { asset, context } = input

  if (asset.workspaceId !== context.workspaceId) {
    return { eligibility: "NOT_ELIGIBLE", qualityResult: "INSUFFICIENT", reasons: ["Asset belongs to a different workspace."] }
  }

  if (asset.productId !== context.productId) {
    return { eligibility: "NOT_ELIGIBLE", qualityResult: "INSUFFICIENT", reasons: ["Asset belongs to a different product."] }
  }

  if (!ELIGIBLE_CATEGORIES.includes(asset.category)) {
    return {
      eligibility: "NOT_ELIGIBLE",
      qualityResult: "INSUFFICIENT",
      reasons: ["Only a real product photo can become the master product asset."],
    }
  }

  const quality = assessImageQuality({
    widthPx: asset.widthPx,
    heightPx: asset.heightPx,
    fileSizeBytes: asset.fileSizeBytes,
    mimeType: asset.mimeType,
  })

  if (quality.result === "READY") {
    return { eligibility: "ELIGIBLE", qualityResult: quality.result, reasons: [] }
  }

  if (quality.result === "IMPROVEMENT_RECOMMENDED") {
    // Honestly reported - no image-improvement capability exists
    // yet in this project, so this asset cannot silently become the
    // preferred master without acknowledging the gap.
    return { eligibility: "IMPROVEMENT_REQUIRED", qualityResult: quality.result, reasons: quality.reasons }
  }

  return { eligibility: "NOT_ELIGIBLE", qualityResult: quality.result, reasons: quality.reasons }
}
