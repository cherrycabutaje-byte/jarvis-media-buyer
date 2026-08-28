/**
 * Action Proposal V1 - deterministic proposal construction over an
 * already-produced SolutionCandidate.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY: this module answers "given an
 * ELIGIBLE solution candidate and the owner's REAL configured
 * guardrails, is there a genuine, well-formed proposal the owner
 * could review and decide on?" It NEVER executes anything, NEVER
 * calls Meta, and NEVER auto-approves. The four-layer distinction
 * remains strict:
 *   DIAGNOSIS -> SOLUTION -> ACTION PROPOSAL (THIS MODULE) -> EXECUTION (future)
 *
 * HARD INPUT BOUNDARY: the only construction entry point,
 * createActionProposalContent(), accepts a SolutionCandidate plus an
 * explicit ActionProposalContext (entity identity + the REAL Owner
 * Guardrails configuration). It never accepts raw Meta data, a
 * MonitorResult, DiagnosticResult, or DiagnosticEvidencePacket.
 *
 * ONLY ELIGIBLE EXPERIMENTS BECOME PROPOSALS: a candidate whose
 * status is not ELIGIBLE, or whose category is not EXPERIMENT (e.g.
 * OBSERVE_MORE_DATA), produces no proposal at all (null) - there is
 * nothing genuinely actionable to ask the owner to decide on.
 *
 * GUARDRAIL REUSE, NEVER RE-DERIVED: this module calls the REAL,
 * already-approved evaluateProposedMediaAction() from
 * ownerGuardrails.ts directly - it never reimplements budget/
 * authority logic. TEST_ALTERNATIVE_CREATIVE is mapped to a
 * TEST_SPEND proposed action using the owner's OWN configured
 * maxTestBudgetCents as the requested amount (since no more specific
 * figure exists in V1) - this makes the guardrail check meaningful:
 * genuinely INSUFFICIENT_CONFIGURATION when the owner hasn't
 * configured authority mode/currency/test budget, genuinely BLOCKED
 * on a currency mismatch, and ALLOWED only when every real guardrail
 * is satisfied.
 *
 * NEVER AUTO-APPROVED: every newly-created proposal starts at
 * PENDING_OWNER_REVIEW regardless of the guardrail decision or the
 * candidate's own confidence - a guardrail ALLOWED decision means
 * "this proposal is not blocked by budget/authority rules", not
 * "this is approved". Only an explicit owner action can move a
 * proposal to APPROVED or DECLINED.
 *
 * DETERMINISTIC CONSTRUCTION, NO PERSISTENCE HERE: this module
 * produces proposal CONTENT only - no id, no created_at, no
 * database access. Persistence (assigning a real id/timestamp,
 * storing, and later updating status) is handled by the repository/
 * Server Action layer, matching the same separation already
 * established by every prior layer in this pipeline.
 */

import type { SolutionCandidate } from "@/lib/product/solutionEngine"
import { evaluateProposedMediaAction, type OwnerGuardrails, type GuardrailEvaluation } from "@/lib/product/ownerGuardrails"

export type ActionProposalStatus = "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED"

export interface ActionProposalContext {
  workspaceId: string
  brandId: string
  entityType: string
  entityId: string
  guardrails: OwnerGuardrails
}

export interface ActionProposalContent {
  workspaceId: string
  brandId: string
  entityType: string
  entityId: string
  solutionCandidateCode: SolutionCandidate["code"]
  solutionCandidateLabel: string
  category: SolutionCandidate["category"]
  rationale: string
  primaryMechanism: SolutionCandidate["primaryMechanism"]
  supportedBy: SolutionCandidate["supportedBy"]
  estimatedRisk: SolutionCandidate["estimatedRisk"]
  estimatedCost: SolutionCandidate["estimatedCost"]
  reversibility: SolutionCandidate["reversibility"]
  /** What JARVIS is actually proposing to spend. Always null in V1 -
   * no independent spend-sizing rule exists for any candidate, so
   * this is never fabricated from the owner's own ceiling. */
  proposedSpendCents: number | null
  /** The owner's own configured ceiling, preserved for DISPLAY only
   * ("Maximum test budget: X"). Deliberately never submitted to the
   * Risk Guard as though it were the proposed spend - closure fix
   * for a real bug where amountCents was previously set equal to
   * this ceiling, making the guard trivially always ALLOWED. */
  maxAuthorizedSpendCents: number | null
  guardrailEvaluation: GuardrailEvaluation
  status: ActionProposalStatus
}

/**
 * Maps a solution candidate to the real ProposedMediaAction shape
 * the (already-approved) Owner Guardrails evaluator expects.
 *
 * CLOSURE FIX (real bug): this previously set amountCents to the
 * owner's own maxTestBudgetCents ceiling, submitting the MAXIMUM to
 * the Risk Guard as though it were the proposed spend - since the
 * guard's own check is amountCents > maxTestBudgetCents, this made
 * the evaluation trivially always ALLOWED (max is never greater than
 * itself), never a meaningful check. No independent spend-sizing
 * rule exists for TEST_ALTERNATIVE_CREATIVE in V1, so amountCents is
 * now always null - the real evaluateProposedMediaAction() already
 * fails closed to INSUFFICIENT_CONFIGURATION when amountCents is
 * null ("The proposed action is missing an amount or currency."),
 * which is the honest outcome given no spend is actually proposed.
 */
function buildProposedAction(candidate: SolutionCandidate, guardrails: OwnerGuardrails): { type: "TEST_SPEND"; amountCents: number | null; currency: string | null } | null {
  if (candidate.code !== "TEST_ALTERNATIVE_CREATIVE") return null
  return {
    type: "TEST_SPEND",
    amountCents: null,
    currency: guardrails.currency,
  }
}

/**
 * Single construction entry point. Accepts ONLY a SolutionCandidate
 * plus an explicit ActionProposalContext. Purely a function of these
 * two inputs - the same candidate and the same context always
 * produce the same ActionProposalContent (or null).
 */
export function createActionProposalContent(candidate: SolutionCandidate, context: ActionProposalContext): ActionProposalContent | null {
  if (candidate.status !== "ELIGIBLE") return null
  if (candidate.category !== "EXPERIMENT") return null

  const proposedAction = buildProposedAction(candidate, context.guardrails)
  const guardrailEvaluation: GuardrailEvaluation = proposedAction
    ? evaluateProposedMediaAction(proposedAction, context.guardrails)
    : { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["This candidate type has no defined proposed spend mapping in V1."] }

  return {
    workspaceId: context.workspaceId,
    brandId: context.brandId,
    entityType: context.entityType,
    entityId: context.entityId,
    solutionCandidateCode: candidate.code,
    solutionCandidateLabel: candidate.label,
    category: candidate.category,
    rationale: candidate.rationale,
    primaryMechanism: candidate.primaryMechanism,
    supportedBy: candidate.supportedBy,
    estimatedRisk: candidate.estimatedRisk,
    estimatedCost: candidate.estimatedCost,
    reversibility: candidate.reversibility,
    proposedSpendCents: proposedAction?.amountCents ?? null,
    maxAuthorizedSpendCents: context.guardrails.maxTestBudgetCents,
    guardrailEvaluation,
    // Always PENDING_OWNER_REVIEW at construction - never
    // auto-approved regardless of the guardrail decision. Owner
    // decision/approval logic itself belongs to a future Owner
    // Approval Workflow slice, not this one.
    status: "PENDING_OWNER_REVIEW",
  }
}