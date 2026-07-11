import { createClient } from "@/lib/supabase/server"

export type BrainRunStatus = "complete" | "partial" | "unknown" | "invalidated"
export type BrainExecutionStatus = "succeeded" | "failed"

export interface BrainRun {
  id: string
  brand_id: string
  architecture_version: string
  business_input: Record<string, unknown>
  intelligence_pipeline: Record<string, unknown>
  status: BrainRunStatus
  is_current: boolean
  business_state_hash: string
  execution_status: BrainExecutionStatus
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  error_detail: string | null
  created_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const BRAIN_RUN_COLUMNS =
  "id, brand_id, architecture_version, business_input, intelligence_pipeline, status, is_current, business_state_hash, execution_status, started_at, completed_at, duration_ms, error_detail, created_at"

/**
 * Persists one Brain pipeline execution as a brain_runs row.
 *
 * Scope note (unchanged from before): this only creates a NEW current
 * run - it does not handle superseding an existing current run for
 * the same brand. If the brand already has a current run, the
 * existing idx_brain_runs_one_current partial unique index
 * (migration 001) will correctly reject this insert.
 */
export async function createBrainRun(params: {
  brandId: string
  architectureVersion: string
  businessInput: Record<string, unknown>
  intelligencePipeline: Record<string, unknown>
  businessStateHash: string
  status: BrainRunStatus
  startedAt: string
  completedAt: string
  durationMs: number
}): Promise<RepositoryResult<BrainRun>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brain_runs")
    .insert({
      brand_id: params.brandId,
      architecture_version: params.architectureVersion,
      business_input: params.businessInput,
      intelligence_pipeline: params.intelligencePipeline,
      business_state_hash: params.businessStateHash,
      status: params.status,
      is_current: true,
      execution_status: "succeeded",
      started_at: params.startedAt,
      completed_at: params.completedAt,
      duration_ms: params.durationMs,
    })
    .select(BRAIN_RUN_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as BrainRun, error: null }
}

/**
 * Fetches the current brain_run for a brand, if one exists. Returns
 * null data (not an error) when no current run exists yet - this is
 * an expected, normal state for a brand that has never been analyzed.
 */
export async function getCurrentBrainRunForBrand(
  brandId: string
): Promise<RepositoryResult<BrainRun | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brain_runs")
    .select(BRAIN_RUN_COLUMNS)
    .eq("brand_id", brandId)
    .eq("is_current", true)
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as BrainRun | null, error: null }
}

/**
 * ADDITIVE (Slice 4): fetches a specific brain_run by its own id.
 *
 * This is the architecturally correct way to resolve "which analysis
 * produced this product" - products.brain_run_id is the authoritative
 * source, not "whatever is currently the brand's newest run" (which
 * getCurrentBrainRunForBrand answers a different, related but
 * distinct question). Using this function instead of substituting
 * getCurrentBrainRunForBrand() keeps persistence correctly tied to
 * the product's own recorded brain_run_id, which will matter once
 * re-analysis/supersession exists (already a known, separately
 * tracked future item) and a brand's current run may no longer be
 * the one a given product was actually built from.
 */
export async function getBrainRunById(brainRunId: string): Promise<RepositoryResult<BrainRun>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brain_runs")
    .select(BRAIN_RUN_COLUMNS)
    .eq("id", brainRunId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as BrainRun, error: null }
}