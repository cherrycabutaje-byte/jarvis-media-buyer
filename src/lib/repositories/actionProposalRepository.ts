import { createClient } from "@/lib/supabase/server"
import type { ActionProposalContent } from "@/lib/product/actionProposal"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Owner Approval Workflow V1 slice: decided_at/decided_by are now
 * genuinely read and written (they were dormant, unused columns on
 * the deployed schema in the prior Action Proposal V1 slice, added
 * in 20260827000001_action_proposals.sql).
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
  decided_at: string | null
  decided_by: string | null
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

export async function getActionProposalById(id: string): Promise<RepositoryResult<StoredActionProposal>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("action_proposals").select("*").eq("id", id).single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionProposal, error: null }
}

/**
 * Records an explicit owner decision. Only ever transitions a
 * proposal that is CURRENTLY PENDING_OWNER_REVIEW - the
 * .eq("status", "PENDING_OWNER_REVIEW") guard is an atomic Postgres
 * row-level UPDATE...WHERE: two simultaneous decisions on the same
 * proposal can never both succeed, since after the first commits,
 * the second's WHERE clause no longer matches and its own UPDATE
 * affects zero rows (triggering .single()'s own error path, handled
 * by the caller as "may have already been decided"). This is the
 * real mechanism preventing a double-decision race - not an
 * application-level lock that could itself have a gap.
 *
 * Never executes anything and never calls Meta - this only changes
 * the proposal's own stored status, decided_at, and decided_by.
 */
export async function decideActionProposal(
  id: string,
  decision: "APPROVED" | "DECLINED",
  decidedByUserId: string
): Promise<RepositoryResult<StoredActionProposal>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_proposals")
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: decidedByUserId })
    .eq("id", id)
    .eq("status", "PENDING_OWNER_REVIEW")
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionProposal, error: null }
}

/**
 * Atomically transitions a PENDING_OWNER_REVIEW proposal to EXPIRED
 * due to staleness (never invoked as a substitute for a genuine
 * owner decision). Uses the exact same concurrency principle as
 * decideActionProposal: the .eq("status", "PENDING_OWNER_REVIEW")
 * guard means a race between an expiration attempt and a genuine
 * decision can never both succeed - whichever UPDATE commits first
 * wins, and the second affects zero rows.
 *
 * Deliberately does NOT set decided_at/decided_by - those columns
 * semantically represent a HUMAN decision, and expiration is a
 * system-driven lifecycle transition, not an owner decision. Never
 * fabricates a decided_by user.
 */
export async function expireActionProposal(id: string): Promise<RepositoryResult<StoredActionProposal>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_proposals")
    .update({ status: "EXPIRED" })
    .eq("id", id)
    .eq("status", "PENDING_OWNER_REVIEW")
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionProposal, error: null }
}