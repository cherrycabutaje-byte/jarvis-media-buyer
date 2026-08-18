/**
 * Static Creative Producer V1
 *
 * ARCHITECTURAL NOTE:
 * Pure, deterministic module - no AI provider calls, no database
 * access, no network calls, no rendering. It consumes a
 * HybridDecisionResult (already computed, prior slice) plus real
 * evidence about available assets and existing literal ad copy, and
 * produces a structured StaticCreativeSpec describing exactly what
 * should be rendered. The actual rendering (JSX -> PNG) happens in
 * a separate module (renderStaticCreative.ts), keeping this module
 * pure and independently testable, matching the same discipline
 * already established throughout src/lib/jarvis-brain and
 * src/lib/hybrid.
 *
 * HONEST COPY HANDLING (Step 3 + Step 19's "do not fabricate"
 * requirement): messagingStrategy.findings.headlineDirection/
 * ctaDirection are STRATEGIC GUIDANCE sentences (e.g. "Frame around
 * core value proposition"), not literal ready-to-print ad copy.
 * Printing that guidance verbatim on a rendered image would
 * misrepresent direction as finished copy. The only genuinely
 * literal ad copy this project has ever produced is
 * assets.asset_payload.rawText (real Claude-generated text_generation
 * output). This module therefore accepts an explicit
 * existingAdCopy: string | null parameter - if null, headline and
 * cta in the resulting spec are honestly null, and "Ad copy
 * (headline/CTA)" is listed as a missing component. Nothing is ever
 * invented to fill this gap.
 *
 * PRODUCTION METHODS SUPPORTED IN THIS SLICE: REUSE, REDESIGN,
 * REMIX - all deterministic, zero generation calls. PARTIAL_
 * GENERATION and FULL_GENERATION return truthful, unsupported
 * results with the precise missing requirement stated - no new
 * generation provider is connected in this slice.
 */

import type { HybridDecisionResult } from "@/lib/hybrid/hybridCreativeDecisionEngine"

export type StaticProductionMethod =
  | "REUSE"
  | "REDESIGN"
  | "REMIX"
  | "PARTIAL_GENERATION"
  | "FULL_GENERATION"

export interface StaticCreativeCostEvidence {
  generationCalls: number
  imageGenerationCalls: number
  videoGenerationCalls: number
}

export interface StaticCreativeLineage {
  sourceCreativeAssetIds: string[]
  hybridDecision: StaticProductionMethod
  hybridDecisionEvidence: string[]
  creativeAngle: string
  layoutTemplate: string | null
}

export interface StaticCreativeSpec {
  supported: boolean
  productionMethod: StaticProductionMethod
  format: "static-image"
  width: number
  height: number
  headline: string | null
  cta: string | null
  productImageAssetId: string | null
  logoAssetId: string | null
  layoutTemplate: "product-hero" | null
  missingComponents: string[]
  reason: string
  lineage: StaticCreativeLineage
  costEvidence: StaticCreativeCostEvidence
}

const ZERO_COST: StaticCreativeCostEvidence = {
  generationCalls: 0,
  imageGenerationCalls: 0,
  videoGenerationCalls: 0,
}

export interface BuildStaticCreativeSpecInput {
  hybridDecision: HybridDecisionResult
  creativeAngle: string
  /**
   * The only genuinely literal ad copy source in this project -
   * assets.asset_payload.rawText from any existing finished asset
   * for this product. Null if none exists - never fabricated.
   */
  existingAdCopy: string | null
  /** The specific selected creative_assets id whose category is 'product_image', if any. */
  productImageAssetId: string | null
  /** The specific selected creative_assets id whose category is 'brand_asset' (logo), if any. */
  logoAssetId: string | null
}

const OUTPUT_WIDTH = 1080
const OUTPUT_HEIGHT = 1080

/**
 * Deterministically extracts a short headline and CTA from existing
 * literal ad copy, if present. This is plain string processing (no
 * AI, no LLM call) - it takes the first sentence as a headline
 * candidate and looks for a short closing sentence as a CTA
 * candidate. If the copy is too short/ambiguous to split
 * confidently, the whole thing is used as the headline and no CTA
 * is claimed - never inventing content that isn't genuinely present
 * in the source text.
 */
function extractHeadlineAndCta(adCopy: string): { headline: string; cta: string | null } {
  const sentences = adCopy
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (sentences.length === 0) {
    return { headline: adCopy.trim(), cta: null }
  }
  if (sentences.length === 1) {
    return { headline: sentences[0], cta: null }
  }

  const headline = sentences[0]
  const lastSentence = sentences[sentences.length - 1]
  // Only treat the last sentence as a CTA if it's short enough to
  // plausibly be a call-to-action rather than another body sentence.
  const cta = lastSentence.length <= 40 ? lastSentence : null

  return { headline, cta }
}

export function buildStaticCreativeSpec(input: BuildStaticCreativeSpecInput): StaticCreativeSpec {
  const { hybridDecision, creativeAngle, existingAdCopy, productImageAssetId, logoAssetId } = input

  const missingComponents: string[] = [...hybridDecision.missingComponents]

  let headline: string | null = null
  let cta: string | null = null
  if (existingAdCopy && existingAdCopy.trim().length > 0) {
    const extracted = extractHeadlineAndCta(existingAdCopy)
    headline = extracted.headline
    cta = extracted.cta
  } else {
    missingComponents.push("Ad copy (headline/CTA)")
  }

  const baseLineage: StaticCreativeLineage = {
    sourceCreativeAssetIds: hybridDecision.selectedAssetIds,
    hybridDecision: hybridDecision.decision,
    hybridDecisionEvidence: hybridDecision.evidence,
    creativeAngle,
    layoutTemplate: null,
  }

  if (hybridDecision.decision === "PARTIAL_GENERATION") {
    return {
      supported: false,
      productionMethod: "PARTIAL_GENERATION",
      format: "static-image",
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      headline,
      cta,
      productImageAssetId,
      logoAssetId,
      layoutTemplate: null,
      missingComponents,
      reason:
        "One or more visual components require generation, which is not performed in this slice. " +
        hybridDecision.missingComponents.join(", "),
      lineage: baseLineage,
      costEvidence: ZERO_COST,
    }
  }

  if (hybridDecision.decision === "FULL_GENERATION") {
    return {
      supported: false,
      productionMethod: "FULL_GENERATION",
      format: "static-image",
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      headline,
      cta,
      productImageAssetId,
      logoAssetId,
      layoutTemplate: null,
      missingComponents,
      reason: "Full visual generation is required, which is not performed in this slice.",
      lineage: baseLineage,
      costEvidence: ZERO_COST,
    }
  }

  // REUSE, REDESIGN, REMIX - all deterministic, supported paths.
  // Layout is intentionally singular in V1 ("better variations, not
  // infinite variations") - product-hero honestly maps to the
  // evidence available (a product image, optionally a logo,
  // optionally headline/CTA text) without inventing per-strategy
  // layout-selection logic not grounded in real data.
  return {
    supported: true,
    productionMethod: hybridDecision.decision,
    format: "static-image",
    width: OUTPUT_WIDTH,
    height: OUTPUT_HEIGHT,
    headline,
    cta,
    productImageAssetId,
    logoAssetId,
    layoutTemplate: "product-hero",
    missingComponents,
    reason: hybridDecision.reason,
    lineage: { ...baseLineage, layoutTemplate: "product-hero" },
    costEvidence: ZERO_COST,
  }
}
