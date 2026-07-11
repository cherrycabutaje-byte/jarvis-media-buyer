import { coordinateBuildDecision } from "@/lib/jarvis-brain/decisionEngine"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"
import type {
  IntelligenceModuleResult,
  ProductStructureObject,
  PackageDefinitionObject,
  DecisionRecord,
} from "@/lib/jarvis-brain/types"

/**
 * Runs Module 13 (Decision Engine) against the Builder chain's output
 * so far, plus the original Brain pipeline's Module 9/10 output.
 *
 * Pure and deterministic, matching the established discipline: no
 * Supabase, no repository, no persistence, no AI provider calls.
 *
 * Important structural detail, confirmed directly against the real
 * signature rather than assumed: coordinateBuildDecision() does NOT
 * take only the Builder chain's outputs (Modules 11 and 12) - it also
 * reaches directly into the original Brain pipeline's
 * campaignIntelligence (Module 10) and variations (Module 9), not
 * anything re-derived from the Builder Layer. This function's
 * signature reflects that: it takes the full pipeline alongside the
 * two Builder results, rather than only chaining Builder outputs
 * together.
 *
 * Persistence remains out of scope for this slice.
 */
export function runDecisionEngine(
  pipeline: BrainPipelineOutput,
  productStructure: IntelligenceModuleResult<ProductStructureObject>,
  packageDefinition: IntelligenceModuleResult<PackageDefinitionObject>
): IntelligenceModuleResult<DecisionRecord> {
  return coordinateBuildDecision(
    productStructure,
    packageDefinition,
    pipeline.campaignIntelligence,
    pipeline.variations
  )
}