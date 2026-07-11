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
 * FIX: startedAt and completedAt are now explicitly captured around
 * the runBrainPipeline() call, and durationMs is computed from their
 * difference - previously these were never captured, leaving
 * completed_at and duration_ms permanently NULL in the database even
 * on successful runs. runBrainPipeline() itself is untouched and
 * remains pure - timing is measured by this caller, not the pipeline.
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

  const startedAt = new Date()

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

  const completedAt = new Date()
  const durationMs = completedAt.getTime() - startedAt.getTime()

  const businessStateHash = computeBusinessStateHash(businessInput)
  const status = aggregateRunStatus(pipelineOutput)

  const result = await createBrainRun({
    brandId,
    architectureVersion: JARVIS_BRAIN_ARCHITECTURE_VERSION,
    businessInput: businessInput as unknown as Record<string, unknown>,
    intelligencePipeline: pipelineOutput as unknown as Record<string, unknown>,
    businessStateHash,
    status,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
  })

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}