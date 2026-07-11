import { buildCreativeAsset } from "@/lib/jarvis-brain/creativeAssetBuilder"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"
import type {
  IntelligenceModuleResult,
  ImageCreativeBrief,
  DecisionRecord,
  VariationStrategyPackage,
} from "@/lib/jarvis-brain/types"

/**
 * Selects the variation package matching Campaign Intelligence's
 * recommended variation. Shared by runCreativeAssetBuilder and
 * runPromptBuilder so both always operate on the same, single
 * variation - not independently re-derived, which could risk
 * selecting different variations if this logic ever changed in only
 * one place.
 */
export function selectRecommendedVariation(
  pipeline: BrainPipelineOutput
): IntelligenceModuleResult<VariationStrategyPackage> {
  const recommendedVariationId = pipeline.campaignIntelligence.findings.recommendedVariation
  const selectedVariation = pipeline.variations.find(
    (v) => v.findings.variationId === recommendedVariationId
  )

  if (!selectedVariation) {
    throw new Error(
      `No variation package found matching the recommended variation id "${recommendedVariationId}".`
    )
  }

  return selectedVariation
}

/**
 * Runs Module 16 (Creative Asset Builder) - enriches the recommended
 * variation's baseline ImageCreativeBrief (Module 9) using the full
 * CreativeStrategyObject context (Module 7) and the Decision Record
 * (Module 13).
 *
 * Pure and deterministic, matching the established discipline: no
 * Supabase, no repository, no persistence, no AI provider calls.
 */
export function runCreativeAssetBuilder(
  pipeline: BrainPipelineOutput,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ImageCreativeBrief> {
  const selectedVariation = selectRecommendedVariation(pipeline)
  return buildCreativeAsset(pipeline.creativeStrategy, selectedVariation, decisionRecord)
}