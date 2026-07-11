import { buildProductStructure } from "@/lib/jarvis-brain/productStructureEngine"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"
import type { IntelligenceModuleResult, ProductStructureObject } from "@/lib/jarvis-brain/types"

/**
 * Runs Module 11 (Product Structure Engine) against a completed Brain
 * pipeline's output.
 *
 * Pure and deterministic, matching runBrainPipeline()'s discipline
 * exactly: no Supabase, no repository, no persistence, no AI provider
 * calls. Takes the same BrainPipelineOutput shape already defined and
 * already stored (as JSON) in brain_runs.intelligence_pipeline -
 * this function does not fetch that data itself, it only transforms
 * an already-loaded pipeline into a ProductStructureObject.
 *
 * Persistence (writing the result onto a products row) is explicitly
 * out of scope for this slice - that belongs to a later slice, once
 * Package Definition and Decision Engine are also individually
 * implemented and validated.
 */
export function runProductStructureEngine(
  pipeline: BrainPipelineOutput
): IntelligenceModuleResult<ProductStructureObject> {
  return buildProductStructure(
    pipeline.businessIntelligence,
    pipeline.audienceIntelligence,
    pipeline.competitorIntelligence,
    pipeline.offerIntelligence,
    pipeline.positioningDecision,
    pipeline.messagingStrategy,
    pipeline.creativeStrategy,
    pipeline.campaignArchitecture,
    pipeline.variations,
    pipeline.campaignIntelligence
  )
}