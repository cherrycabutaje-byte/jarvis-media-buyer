"use server"

import { createClient } from "@/lib/supabase/server"
import { runBrainPipeline, type BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"
import { computeBusinessStateHash } from "@/lib/brain/businessStateHash"
import { createBrainRun, type BrainRun, type BrainRunStatus } from "@/lib/repositories/brainRunRepository"
import type { BusinessInput } from "@/lib/jarvis-brain/types"

// TODO: no authoritative architecture version string was found or
// confirmed anywhere in the project. Using a neutral placeholder per
// explicit decision, rather than inventing a version number. This
// should be standardized once versioning is addressed as its own
// task - not assumed here.
const JARVIS_BRAIN_ARCHITECTURE_VERSION = "Architecture Version (TBD)"

export interface RunBrainAnalysisResult {
  success: boolean
  data: BrainRun | null
  error: string | null
}

/**
 * Aggregates the ten module-level statuses already present in the
 * pipeline output into one overall run status. Deliberately not
 * hardcoded to "complete" - that would misrepresent runs where one or
 * more modules genuinely reported partial or unknown confidence.
 * "unknown" takes priority over "partial", which takes priority over
 * "complete" - the run is only as good as its weakest module.
 */
function aggregateRunStatus(pipeline: BrainPipelineOutput): BrainRunStatus {
  const statuses = [
    pipeline.businessIntelligence.status,
    pipeline.audienceIntelligence.status,
    pipeline.competitorIntelligence.status,
    pipeline.offerIntelligence.status,
    pipeline.positioningDecision.status,
    pipeline.messagingStrategy.status,
    pipeline.creativeStrategy.status,
    pipeline.campaignArchitecture.status,
    ...pipeline.variations.map((v) => v.status),
    pipeline.campaignIntelligence.status,
  ]

  if (statuses.includes("unknown")) return "unknown"
  if (statuses.includes("partial")) return "partial"
  return "complete"
}

/**
 * Server Action: runs the Brain pipeline for a brand and persists the
 * result as a brain_runs row.
 *
 * runBrainPipeline() itself remains pure (no Supabase, no
 * persistence, no AI calls) - this action is the only place that
 * calls it AND persists its output, via BrainRunRepository. This
 * matches the recorded architectural pattern: bootstrap/transactional
 * concerns aside, this is ordinary Client -> Server Action ->
 * Repository -> RLS -> Database flow, just with a pure computation
 * step inserted between the auth check and the persistence call.
 */
export async function runBrainAnalysisAction(
  brandId: string,
  businessInput: BusinessInput
): Promise<RunBrainAnalysisResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to run analysis." }
  }

  if (!brandId) {
    return { success: false, data: null, error: "A brand is required to run analysis." }
  }

  if (!businessInput.productName?.trim() || !businessInput.productDescription?.trim()) {
    return { success: false, data: null, error: "Product name and description are required." }
  }

  let pipelineOutput: BrainPipelineOutput
  try {
    pipelineOutput = runBrainPipeline(businessInput)
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "The Brain pipeline failed to execute.",
    }
  }

  const businessStateHash = computeBusinessStateHash(businessInput)
  const status = aggregateRunStatus(pipelineOutput)

  const result = await createBrainRun({
    brandId,
    architectureVersion: JARVIS_BRAIN_ARCHITECTURE_VERSION,
    businessInput: businessInput as unknown as Record<string, unknown>,
    intelligencePipeline: pipelineOutput as unknown as Record<string, unknown>,
    businessStateHash,
    status,
  })

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}