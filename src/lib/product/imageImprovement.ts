/**
 * Image Improvement Decision Engine V1
 *
 * ARCHITECTURAL NOTE:
 * Pure, deterministic module - no AI calls. Reuses assessImageQuality
 * (unchanged, frozen from the prior slice) for the baseline quality
 * signal, then honestly distinguishes what deterministic image
 * processing can genuinely fix from what would require real AI
 * capability. Never claims ordinary resizing can restore detail
 * that a low-resolution source genuinely does not contain.
 *
 * DECISION MEANINGS:
 * - USE_AS_IS: quality is already good, no processing needed.
 * - DETERMINISTIC_IMPROVEMENT: a safe, quality-preserving operation
 *   (downscaling an oversized image, or fitting an extreme aspect
 *   ratio onto a standard canvas without stretching) can genuinely
 *   help - executed via renderDeterministicImprovement.
 * - AI_IMPROVEMENT_REQUIRED: the real issue (e.g. genuinely low
 *   resolution) cannot be fixed by resizing - ordinary upscaling
 *   does not add real detail. Honestly reported as needing a real
 *   capability not implemented in this slice.
 * - REPLACEMENT_RECOMMENDED: the source is too degraded to be
 *   usable at all (matches assessImageQuality's INSUFFICIENT).
 */

import { assessImageQuality } from "@/lib/product/imageQualityGate"

export type ImprovementDecision =
  | "USE_AS_IS"
  | "DETERMINISTIC_IMPROVEMENT"
  | "AI_IMPROVEMENT_REQUIRED"
  | "REPLACEMENT_RECOMMENDED"

export interface ImageImprovementResult {
  decision: ImprovementDecision
  reasons: string[]
  /** Only set when decision === AI_IMPROVEMENT_REQUIRED - what real capability would be needed. */
  requiredCapability: string | null
  /** Only set when decision === DETERMINISTIC_IMPROVEMENT - what will actually be done. */
  deterministicOperations: string[]
  targetMaxDimension: number | null
}

export interface DecideImageImprovementInput {
  widthPx: number | null
  heightPx: number | null
  fileSizeBytes: number
  mimeType: string
}

const MAX_REASONABLE_DIMENSION = 3000
const RECOMMENDED_MIN_DIMENSION = 1000
const MAX_REASONABLE_ASPECT_RATIO = 3.5
const STANDARD_OUTPUT_DIMENSION = 1080

export function decideImageImprovement(input: DecideImageImprovementInput): ImageImprovementResult {
  const quality = assessImageQuality(input)

  if (quality.result === "INSUFFICIENT") {
    return {
      decision: "REPLACEMENT_RECOMMENDED",
      reasons: quality.reasons,
      requiredCapability: null,
      deterministicOperations: [],
      targetMaxDimension: null,
    }
  }

  const { widthPx, heightPx } = input
  // Guaranteed non-null past this point - assessImageQuality only
  // returns non-INSUFFICIENT when both dimensions are known.
  const w = widthPx as number
  const h = heightPx as number

  const isOversized = w > MAX_REASONABLE_DIMENSION || h > MAX_REASONABLE_DIMENSION
  const aspectRatio = Math.max(w, h) / Math.min(w, h)
  const hasExtremeAspectRatio = aspectRatio > MAX_REASONABLE_ASPECT_RATIO
  const isBelowRecommended = w < RECOMMENDED_MIN_DIMENSION || h < RECOMMENDED_MIN_DIMENSION

  // CTO-directed fix, verified by exhaustive check (see
  // scripts/test-image-improvement.ts): given the current
  // thresholds, an extreme aspect ratio (>3.5) can only occur
  // together with isOversized firing first - min >= RECOMMENDED_MIN_DIMENSION
  // combined with ratio > MAX_REASONABLE_ASPECT_RATIO always implies
  // max > 3500, exceeding MAX_REASONABLE_DIMENSION (3000). This is
  // not a coincidence of untested inputs; it is a structural
  // consequence of these three specific threshold values, confirmed
  // by exhaustively checking every (width, height) pair in the
  // relevant range. A standalone "extreme aspect ratio only" branch
  // is therefore genuinely dead code, not merely under-tested -
  // removed rather than kept as misleading, unreachable coverage.
  // Both real-world triggers (oversized, or an unusually-shaped
  // image) converge on the identical safe outcome below:
  // renderDeterministicImprovement always applies objectFit:"contain"
  // into a square canvas regardless of which condition triggered it,
  // so no distinct handling was ever lost by merging these reasons.
  if (isOversized || hasExtremeAspectRatio) {
    return {
      decision: "DETERMINISTIC_IMPROVEMENT",
      reasons: [
        "Image exceeds a reasonable working size or has an unusual aspect ratio, and can be safely fitted onto a standard canvas without stretching, cropping, or losing usable quality.",
      ],
      requiredCapability: null,
      deterministicOperations: ["Fit onto a standard canvas while preserving aspect ratio", "Normalize output format"],
      targetMaxDimension: STANDARD_OUTPUT_DIMENSION,
    }
  }

  if (isBelowRecommended) {
    // Honest: ordinary resizing/upscaling cannot add real detail
    // that a low-resolution source genuinely does not contain.
    return {
      decision: "AI_IMPROVEMENT_REQUIRED",
      reasons: ["Resolution is below the recommended size. Ordinary resizing cannot restore detail the source does not contain."],
      requiredCapability: "Resolution enhancement (real detail synthesis, not implemented in this slice)",
      deterministicOperations: [],
      targetMaxDimension: null,
    }
  }

  return {
    decision: "USE_AS_IS",
    reasons: [],
    requiredCapability: null,
    deterministicOperations: [],
    targetMaxDimension: null,
  }
}
