import { buildProviderPrompt } from "@/lib/jarvis-brain/promptBuilder"
import { selectRecommendedVariation } from "@/lib/builder/runCreativeAssetBuilder"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"
import type { IntelligenceModuleResult, ProviderPrompt, DecisionRecord } from "@/lib/jarvis-brain/types"

/**
 * Runs Module 14 (Prompt Builder) against the recommended variation's
 * baseline TextStrategyBrief (Module 9) and the Decision Record
 * (Module 13).
 *
 * Uses the SAME selectRecommendedVariation() helper as
 * runCreativeAssetBuilder, so both operate on the same single
 * variation - not independently re-derived.
 *
 * Pure and deterministic: no Supabase, no repository, no persistence,
 * no AI provider calls. This is the permanent architectural boundary
 * - any text provider must only ever receive the ProviderPrompt this
 * function returns, never any raw Brain object.
 */
export function runPromptBuilder(
  pipeline: BrainPipelineOutput,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ProviderPrompt> {
  const selectedVariation = selectRecommendedVariation(pipeline)
  return buildProviderPrompt(selectedVariation.findings.textStrategyBrief, decisionRecord)
}