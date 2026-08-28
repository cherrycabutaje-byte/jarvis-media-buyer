import { createClient } from "@/lib/supabase/server"
import type { ActionProposalContent } from "@/lib/product/actionProposal"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Owner Approval Workflow V1 (a future slice) will introduce
 * decision-related reads/writes. decided_at/decided_by remain
 * dormant columns on the deployed schema (added in
 * 20260827000001_action_proposals.sql, which is not rewritten here)
 * but are intentionally UNUSED by Action Proposal V1 - no code in
 * this repository ever reads or writes them.
 */
export interface StoredActionProposal {
  id: string
  workspace_id: string
  brand_id: string
  entity_type: string
  entity_id: string
  solution_candidate_code: string
  solution_candidate_label: string
  category: string
  rationale: string
  primary_mechanism: string | null
  supported_by: string[]
  estimated_risk: string
  estimated_cost_cents: number | null
  reversibility: string
  proposed_spend_cents: number | null
  max_authorized_spend_cents: number | null
  guardrail_decision: string
  guardrail_reasons: string[]
  status: string
  created_at: string
  created_by: string | null
}

export async function insertActionProposal(content: ActionProposalContent, createdByUserId: string): Promise<RepositoryResult<StoredActionProposal>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_proposals")
    .insert({
      workspace_id: content.workspaceId,
      brand_id: content.brandId,
      entity_type: content.entityType,
      entity_id: content.entityId,
      solution_candidate_code: content.solutionCandidateCode,
      solution_candidate_label: content.solutionCandidateLabel,
      category: content.category,
      rationale: content.rationale,
      primary_mechanism: content.primaryMechanism,
      supported_by: content.supportedBy,
      estimated_risk: content.estimatedRisk,
      estimated_cost_cents: content.estimatedCost,
      reversibility: content.reversibility,
      proposed_spend_cents: content.proposedSpendCents,
      max_authorized_spend_cents: content.maxAuthorizedSpendCents,
      guardrail_decision: content.guardrailEvaluation.decision,
      guardrail_reasons: content.guardrailEvaluation.reasons,
      status: content.status,
      created_by: createdByUserId,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionProposal, error: null }
}

export async function getActionProposalsForBrand(brandId: string): Promise<RepositoryResult<StoredActionProposal[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_proposals")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredActionProposal[], error: null }
}