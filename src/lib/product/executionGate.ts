/**
 * Execution Contract / Safety Gate V1 - the deterministic boundary
 * between "the owner approved a proposal" and "JARVIS is allowed to
 * send a live action to Meta".
 *
 * PERMANENT INVARIANT: APPROVED != EXECUTABLE. An approved proposal
 * becomes executable only if every concrete parameter required for
 * that exact action is present and every applicable safety
 * constraint is satisfied. This module NEVER calls Meta, NEVER
 * spends money, NEVER creates/mutates a campaign/ad-set/ad/budget,
 * and NEVER generates creative. It answers exactly one read-only
 * question: is this exact approved proposal sufficiently concrete
 * and safe to become eligible for a future executor?
 *
 * FAIL CLOSED: unknown or incomplete information always means
 * NOT_EXECUTABLE. There is no "probably safe" path to EXECUTABLE.
 *
 * GUARDRAIL RE-EVALUATION, NEVER PROPOSAL MUTATION: the persisted
 * guardrail_decision on a proposal is IMMUTABLE PROPOSAL-TIME
 * EVIDENCE, snapshotted once at construction - it is never live
 * execution authorization and must never be blindly trusted as
 * such. This gate re-evaluates the REAL, already-approved
 * evaluateProposedMediaAction() using the owner's CURRENT
 * guardrails, paired with the proposal's own immutable
 * proposedSpendCents. The persisted proposal itself is NEVER
 * mutated, recomputed, or overwritten by this re-evaluation.
 *
 * CURRENCY - A GENUINE V1 GAP (closure finding): no currency is
 * persisted anywhere on an Action Proposal - it is used transiently
 * during construction to build the guardrail check and then
 * discarded. This means proposedCurrency is structurally always
 * null when wired from real production data in V1, and
 * MISSING_CURRENCY will always fire for any real proposal today.
 * This field exists on the input contract (rather than being
 * omitted) so a future slice that DOES persist a concrete currency
 * can supply it, and so a positive-control test fixture can
 * exercise the EXECUTABLE path without ever touching production
 * code.
 *
 * TARGET ENTITY / CREATIVE ASSET - GENUINE V1 GAPS: only an
 * ACCOUNT-level entityId is ever captured on a proposal today (never
 * a specific campaign/ad-set/ad to place a new test into), and no
 * creative asset selection field exists anywhere. These are real,
 * structural absences, not values this module fabricates or infers.
 * targetMetaEntityId and creativeAssetId exist on the input contract
 * for the same reason as proposedCurrency above - always null from
 * real data in V1.
 *
 * EXECUTION FRESHNESS - NOT IMPLEMENTED (documented limitation, not
 * an invented rule): Owner Approval V1 established a 72-hour
 * PENDING-review window, but nothing in the current architecture
 * establishes how long an ALREADY-APPROVED decision remains
 * execution-valid. Inventing a second arbitrary threshold here would
 * be fabricating an advertising-domain rule that does not yet exist.
 * This module deliberately does not check post-approval age.
 */

import type { ActionProposalStatus } from "@/lib/product/ownerDecision"
import { evaluateProposedMediaAction, type OwnerGuardrails } from "@/lib/product/ownerGuardrails"

export type ExecutionEligibilityStatus = "EXECUTABLE" | "NOT_EXECUTABLE"

export interface ExecutionReason {
  code: string
  message: string
}

export interface ExecutionEligibilityResult {
  status: ExecutionEligibilityStatus
  reasons: ExecutionReason[]
}

/**
 * Registry of solution-candidate codes that could conceptually ever
 * become executable in a future slice. Deliberately narrow and
 * explicit - never inferred from category alone, so adding a new
 * Solution Engine candidate code never silently becomes executable
 * without an explicit decision here. OBSERVE_MORE_DATA (category
 * OBSERVATION) is never in this set and never will be - it is
 * informational by definition, not an action.
 */
const EXECUTABLE_CAPABILITY_CODES: ReadonlySet<string> = new Set(["TEST_ALTERNATIVE_CREATIVE"])

export interface ExecutionEligibilityProposalInput {
  solutionCandidateCode: string
  category: string
  status: ActionProposalStatus
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
  entityType: string
  entityId: string
  proposedSpendCents: number | null
  maxAuthorizedSpendCents: number | null
  /** Always null when wired from real V1 data - see module doc. */
  proposedCurrency: string | null
  /** Always null when wired from real V1 data - see module doc. */
  targetMetaEntityId: string | null
  /** Always null when wired from real V1 data - see module doc. */
  creativeAssetId: string | null
}

export interface ExecutionEligibilityInput {
  proposal: ExecutionEligibilityProposalInput
  /** The owner's CURRENT guardrail configuration, fetched fresh by
   * the caller at evaluation time - never the proposal's own stale
   * persisted guardrail_decision string. */
  currentGuardrails: OwnerGuardrails
  /** The brand's CURRENTLY live Meta ad account id, fetched fresh by
   * the caller - null if no live connection currently exists. */
  currentMetaAdAccountId: string | null
}

function reason(code: string, message: string): ExecutionReason {
  return { code, message }
}

/**
 * Pure, deterministic, read-only evaluation. Never mutates the
 * proposal, guardrails, budget, assets, or Meta connection state * supplied to it. Prefers returning ALL safely determinable
 * blockers over stopping at the first one, so the owner eventually
 * understands everything that remains before execution could ever
 * be considered.
 */
export function evaluateExecutionEligibility(input: ExecutionEligibilityInput): ExecutionEligibilityResult {
  const { proposal } = input

  // Owner approval requirement. A non-APPROVED proposal has nothing
  // further meaningful to check - every other blocker would be
  // premature noise, so this returns immediately with a single,
  // precise reason.
  if (proposal.status !== "APPROVED") {
    const code =
      proposal.status === "PENDING_OWNER_REVIEW" ? "PROPOSAL_NOT_APPROVED" : proposal.status === "DECLINED" ? "PROPOSAL_DECLINED" : "PROPOSAL_EXPIRED"
    const message =
      proposal.status === "PENDING_OWNER_REVIEW"
        ? "This proposal has not yet been approved by the owner."
        : proposal.status === "DECLINED"
          ? "This proposal was declined and cannot be executed."
          : "This proposal expired before a decision was made and cannot be executed."
    return { status: "NOT_EXECUTABLE", reasons: [reason(code, message)] }
  }

  // From here, status === APPROVED. Accumulate every determinable
  // blocker rather than stopping at the first.
  const reasons: ExecutionReason[] = []

  // Approval provenance must be internally consistent - an APPROVED
  // status with missing human-decision metadata is never silently
  // repaired, only rejected.
  if (!proposal.decidedBy || !proposal.decidedAt) {
    reasons.push(reason("INVALID_APPROVAL_PROVENANCE", "This proposal's approval record is incomplete and cannot be trusted."))
  }

  // Capability registry check. OBSERVE_MORE_DATA (and any other
  // OBSERVATION-category candidate) is information-only by
  // definition and short-circuits here - it can never produce a live
  // execution contract, regardless of any other field.
  if (proposal.category === "OBSERVATION") {
    return { status: "NOT_EXECUTABLE", reasons: [reason("INFORMATION_ONLY", "This is an observation, not an action - there is nothing to execute.")] }
  }
  if (!EXECUTABLE_CAPABILITY_CODES.has(proposal.solutionCandidateCode)) {
    reasons.push(reason("UNSUPPORTED_EXECUTION_CAPABILITY", "This type of proposal does not yet have a supported execution path."))
  }

  // Fresh guardrail re-evaluation using the REAL, already-approved
  // evaluator - the owner's CURRENT configuration, never the
  // proposal's own immutable, potentially-stale snapshot.
  const freshGuardrail = evaluateProposedMediaAction(
    { type: "TEST_SPEND", amountCents: proposal.proposedSpendCents, currency: proposal.proposedCurrency },
    input.currentGuardrails
  )
  if (freshGuardrail.decision === "BLOCKED") {
    reasons.push(reason("GUARDRAIL_BLOCKED", "This proposal exceeds your currently configured budget limits."))
  } else if (freshGuardrail.decision === "INSUFFICIENT_CONFIGURATION") {
    reasons.push(reason("GUARDRAIL_INCOMPLETE", "Your budget and authority settings are not fully configured to evaluate this proposal."))
  }

  // Proposed spend validity - the critical money rule.
  if (proposal.proposedSpendCents === null) {
    reasons.push(reason("MISSING_PROPOSED_SPEND", "A concrete test budget has not been proposed."))
  } else if (!Number.isInteger(proposal.proposedSpendCents) || proposal.proposedSpendCents <= 0) {
    reasons.push(reason("INVALID_PROPOSED_SPEND", "The proposed budget is not a valid positive amount."))
  }

  // Maximum authorized spend check. Never clamps or silently lowers
  // the proposed amount to the ceiling.
  if (proposal.maxAuthorizedSpendCents === null) {
    reasons.push(reason("MISSING_MAXIMUM_AUTHORIZATION", "No maximum authorized budget has been configured."))
  } else if (proposal.proposedSpendCents !== null && proposal.proposedSpendCents > proposal.maxAuthorizedSpendCents) {
    reasons.push(reason("SPEND_EXCEEDS_AUTHORIZED_MAXIMUM", "The proposed budget exceeds your configured maximum."))
  }

  // Currency. No FX conversion in V1 - exact match required.
  if (proposal.proposedCurrency === null) {
    reasons.push(reason("MISSING_CURRENCY", "No currency has been set for the proposed spend."))
  } else if (input.currentGuardrails.currency !== null && proposal.proposedCurrency !== input.currentGuardrails.currency) {
    reasons.push(reason("CURRENCY_MISMATCH", "The proposed currency does not match your configured budget currency."))
  }

  // Meta account binding. Re-verifies the CURRENT live connection
  // matches the exact account captured at proposal time - never
  // trusts the stored entityId alone as proof a connection still
  // exists or still points to the same account.
  if (!input.currentMetaAdAccountId || input.currentMetaAdAccountId !== proposal.entityId) {
    reasons.push(reason("MISSING_META_ACCOUNT", "No currently connected Meta ad account matches this proposal."))
  }

  // Exact target entity. An ACCOUNT-level identifier alone is never
  // a valid, exact placement target for a live action.
  if (!proposal.targetMetaEntityId) {
    reasons.push(reason("MISSING_TARGET_ENTITY", "An exact target for this action has not been selected."))
  }

  // Creative asset, for candidates that need one.
  if (proposal.solutionCandidateCode === "TEST_ALTERNATIVE_CREATIVE" && !proposal.creativeAssetId) {
    reasons.push(reason("MISSING_CREATIVE_ASSET", "No test creative has been selected."))
  }

  if (reasons.length > 0) {
    return { status: "NOT_EXECUTABLE", reasons }
  }

  return { status: "EXECUTABLE", reasons: [] }
}