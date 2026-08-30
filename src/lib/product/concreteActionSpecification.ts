/**
 * Concrete Action Specification V1 - converts an approved high-level
 * Action Proposal into an explicit, eventually-immutable description
 * of the exact action that could later be authorized for execution.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY, THREE-LAYER SEPARATION:
 *   ACTION PROPOSAL   - "this kind of experiment could help" (approved
 *                        by the owner as an intent to explore)
 *   CONCRETE SPECIFICATION (THIS MODULE) - "here is the EXACT account,
 *                        target, creative, and spend this would use"
 *   CONCRETE OWNER AUTHORIZATION (future) - the owner's explicit
 *                        sign-off on THIS EXACT specification
 * SPECIFIED != AUTHORIZED. AUTHORIZED != EXECUTED. This module
 * performs ZERO live execution and NEVER auto-authorizes a
 * specification merely because it reaches READY_FOR_OWNER_AUTHORIZATION.
 *
 * PROPOSAL APPROVAL DOES NOT PRE-AUTHORIZE LATER-ADDED PARAMETERS:
 * the owner's earlier approval of the high-level proposal ("test an
 * alternative creative") is never reinterpreted as approval of the
 * exact spend/target/creative chosen afterward - those did not exist
 * at approval time. A future Concrete Owner Authorization slice
 * (not built here) is required before any of this becomes
 * executable.
 *
 * V1 SCOPE: only TEST_ALTERNATIVE_CREATIVE. OBSERVE_MORE_DATA (and
 * any other OBSERVATION-category candidate) can never produce a
 * specification - there is no action to make concrete.
 *
 * FAIL CLOSED: unknown or incomplete information always means
 * NOT_READY. There is no "probably fine" path to READY.
 *
 * GUARDRAIL REUSE, NEVER DUPLICATED: this module calls the REAL,
 * already-approved evaluateProposedMediaAction() directly - it never
 * reimplements budget/authority logic, matching the same pattern
 * already established in actionProposal.ts and executionGate.ts.
 */

import { evaluateProposedMediaAction, type OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import { evaluateExecutionEligibility, type ExecutionEligibilityResult } from "@/lib/product/executionGate"

export type SpecificationStatus = "DRAFT" | "READY_FOR_OWNER_AUTHORIZATION" | "AUTHORIZED" | "DECLINED" | "SUPERSEDED"

/** V1 supports exactly one action type. Adding a new one requires an
 * explicit, deliberate extension here - never inferred from a
 * Solution Engine candidate code alone. */
export type SpecificationActionType = "TEST_ALTERNATIVE_CREATIVE"

export type SpecificationReadinessStatus = "READY" | "NOT_READY"

export interface SpecificationReason {
  code: string
  message: string
}

export interface SpecificationReadinessResult {
  status: SpecificationReadinessStatus
  reasons: SpecificationReason[]
}

/**
 * The proposal's own trusted, persisted state - fetched server-side,
 * never client-supplied.
 */
export interface BoundProposalInput {
  status: "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED"
  solutionCandidateCode: string
  category: string
  workspaceId: string
  brandId: string
}

/**
 * The draft specification's own current field values - some may be
 * null while still in DRAFT (Section 18: a DRAFT may be incomplete).
 * All must be concrete and validated before READY.
 */
export interface DraftSpecificationInput {
  actionType: SpecificationActionType
  metaAdAccountId: string | null
  targetEntityType: string | null
  targetEntityId: string | null
  creativeAssetId: string | null
  proposedSpendCents: number | null
  currency: string | null
}

export interface SpecificationReadinessInput {
  proposal: BoundProposalInput
  draft: DraftSpecificationInput
  /** True only when the server has independently verified the
   * referenced creative asset exists AND belongs to the same   * referenced creative asset exists AND belongs to the same
   * workspace/brand scope as the proposal - never assumed from a
   * bare non-null id. */
  creativeAssetOwnershipVerified: boolean
  /** True only when the server has independently verified the
   * referenced target entity was genuinely observed (synced) for
   * this exact Meta ad account link - never assumed from a bare
   * non-null id. */
  targetEntityOwnershipVerified: boolean
  maxAuthorizedSpendCents: number | null
  currentGuardrails: OwnerGuardrails
}

function reason(code: string, message: string): SpecificationReason {
  return { code, message }
}

/**
 * Pure, deterministic, read-only readiness evaluation. Never mutates
 * anything. Prefers returning ALL safely determinable blockers over
 * stopping at the first one (matching the same discipline already
 * established in executionGate.ts).
 */
export function evaluateSpecificationReadiness(input: SpecificationReadinessInput): SpecificationReadinessResult {
  const { proposal, draft } = input

  // Proposal binding: only an APPROVED proposal may back a
  // specification at all. Nothing else is meaningful to check
  // further, so this returns immediately.
  if (proposal.status !== "APPROVED") {
    const code =
      proposal.status === "PENDING_OWNER_REVIEW" ? "PROPOSAL_NOT_APPROVED" : proposal.status === "DECLINED" ? "PROPOSAL_DECLINED" : "PROPOSAL_EXPIRED"
    const message =
      proposal.status === "PENDING_OWNER_REVIEW"
        ? "This proposal has not yet been approved by the owner."
        : proposal.status === "DECLINED"
          ? "This proposal was declined."
          : "This proposal expired before a decision was made."
    return { status: "NOT_READY", reasons: [reason(code, message)] }
  }

  // OBSERVE_MORE_DATA (or any OBSERVATION-category candidate) can
  // never produce a specification - there is no action to make
  // concrete.
  if (proposal.category === "OBSERVATION") {
    return { status: "NOT_READY", reasons: [reason("ACTION_MISMATCH", "This is an observation, not an action - there is nothing to specify.")] }
  }

  // Proposal action binding: the specification's action must match
  // the proposal's own candidate code exactly.
  if (proposal.solutionCandidateCode !== draft.actionType) {
    return {
      status: "NOT_READY",
      reasons: [reason("ACTION_MISMATCH", "This specification does not match the action the owner actually approved.")],
    }
  }

  const reasons: SpecificationReason[] = []

  // Meta account - must be server-derived and present. Never
  // accepted as client-supplied authority.
  if (!draft.metaAdAccountId) {
    reasons.push(reason("MISSING_META_ACCOUNT", "No connected Meta ad account is available for this business."))
  }

  // Exact target entity.
  if (!draft.targetEntityType || !draft.targetEntityId) {
    reasons.push(reason("MISSING_TARGET", "An exact target for this action has not been selected."))
  } else if (!input.targetEntityOwnershipVerified) {
    reasons.push(reason("INVALID_TARGET", "The selected target could not be verified as genuinely available for this business."))
  }

  // Creative asset.
  if (!draft.creativeAssetId) {
    reasons.push(reason("MISSING_CREATIVE", "No test creative has been selected."))
  } else if (!input.creativeAssetOwnershipVerified) {
    reasons.push(reason("INVALID_CREATIVE", "The selected creative could not be verified as belonging to this business."))
  }

  // Proposed spend - the critical money rule. Never derived from
  // the maximum, never invented.
  if (draft.proposedSpendCents === null) {
    reasons.push(reason("MISSING_SPEND", "A concrete test budget has not been proposed."))
  } else if (!Number.isInteger(draft.proposedSpendCents) || draft.proposedSpendCents <= 0) {
    reasons.push(reason("INVALID_SPEND", "The proposed budget is not a valid positive amount."))
  } else if (input.maxAuthorizedSpendCents !== null && draft.proposedSpendCents > input.maxAuthorizedSpendCents) {
    reasons.push(reason("SPEND_EXCEEDS_LIMIT", "The proposed budget exceeds your configured maximum."))
  }

  // Currency - explicit, server-sourced, no FX conversion.
  if (!draft.currency) {    reasons.push(reason("MISSING_CURRENCY", "No currency has been set for the proposed spend."))
  } else if (input.currentGuardrails.currency !== null && draft.currency !== input.currentGuardrails.currency) {
    reasons.push(reason("CURRENCY_MISMATCH", "The proposed currency does not match your configured budget currency."))
  }

  // Guardrail validation - reuses the REAL evaluator, never
  // duplicated. Only meaningful once spend/currency are both present.
  if (draft.proposedSpendCents !== null && draft.currency !== null) {
    const guardrailResult = evaluateProposedMediaAction(
      { type: "TEST_SPEND", amountCents: draft.proposedSpendCents, currency: draft.currency },
      input.currentGuardrails
    )
    if (guardrailResult.decision === "BLOCKED") {
      reasons.push(reason("GUARDRAIL_BLOCKED", "This proposed spend exceeds your currently configured budget limits."))
    } else if (guardrailResult.decision === "INSUFFICIENT_CONFIGURATION") {
      reasons.push(reason("GUARDRAIL_INCOMPLETE", "Your budget and authority settings are not fully configured to evaluate this proposal."))
    }
  }

  if (reasons.length > 0) {
    return { status: "NOT_READY", reasons }
  }

  return { status: "READY", reasons: [] }
}

/**
 * Concrete Owner Authorization V1 slice addition.
 *
 * PERMANENT INVARIANT: READY_FOR_OWNER_AUTHORIZATION != AUTHORIZED.
 * An owner must explicitly authorize the exact immutable
 * specification - this pure function validates ONLY the state
 * transition itself (is READY the current status?). It does NOT
 * revalidate Meta account/target/creative/spend/currency/guardrails
 * - that full revalidation happens server-side, independently,
 * before this function is ever called (see actionSpecificationActions.ts).
 *
 * Reauthorization and decision reversal are never permitted in V1:
 * AUTHORIZED and DECLINED are both terminal. DRAFT cannot be
 * authorized or declined at all - it must first reach READY.
 */

export type AuthorizationDecisionType = "AUTHORIZE" | "DECLINE"

export interface AuthorizationValidationResult {
  valid: boolean
  resultingStatus: "AUTHORIZED" | "DECLINED" | null
  reason: string | null
}

export function validateConcreteAuthorization(
  currentStatus: SpecificationStatus,
  decision: AuthorizationDecisionType
): AuthorizationValidationResult {
  if (currentStatus !== "READY_FOR_OWNER_AUTHORIZATION") {
    return {
      valid: false,
      resultingStatus: null,
      reason: `This specification is ${currentStatus.toLowerCase().replace(/_/g, " ")} and cannot be authorized or declined.`,
    }
  }

  return {
    valid: true,
    resultingStatus: decision === "AUTHORIZE" ? "AUTHORIZED" : "DECLINED",
    reason: null,
  }
}

/**
 * Concrete Owner Authorization V1 -> Execution Safety Gate bridge.
 *
 * SMALLEST SAFE INTEGRATION: executionGate.ts itself is NEVER
 * modified. This function only WIRES a Concrete Action
 * Specification's own concrete, authorized fields into the
 * EXISTING, unchanged evaluateExecutionEligibility() input shape -
 * the same pure gate function already proven in Execution Safety
 * Gate V1. Prior to this slice, that gate's proposedCurrency/
 * targetMetaEntityId/creativeAssetId inputs were always null from
 * real data; this is the first slice where a real, concrete,
 * authorized source for those fields exists.
 *
 * PERMANENT INVARIANT: AUTHORIZED != EXECUTABLE. Reaching AUTHORIZED
 * status is necessary but never sufficient - the underlying gate
 * still independently re-evaluates every safety condition (proposal
 * approval, guardrails, spend/currency/target/creative validity)
 * exactly as it always has. This function adds exactly one new,
 * specification-specific gate BEFORE deferring to the existing gate:
 * the specification's OWN authorization provenance (decided_by/
 * decided_at on THIS row, never the proposal's) must itself be
 * genuinely present - an AUTHORIZED status with missing provenance
 * is never trusted, matching the same discipline already applied to
 * proposal approval provenance in Execution Safety Gate V1.
 */

export interface AuthorizedSpecificationInput {
  status: SpecificationStatus
  decidedAt: string | null
  decidedBy: string | null
  actionType: SpecificationActionType
  metaAdAccountId: string | null
  targetEntityType: string | null
  targetEntityId: string | null
  creativeAssetId: string | null
  proposedSpendCents: number | null
  currency: string | null
}

export function evaluateAuthorizedSpecificationExecutionEligibility(
  specification: AuthorizedSpecificationInput,
  proposal: {
    status: "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED"
    solutionCandidateCode: string
    category: string
    createdAt: string
    decidedAt: string | null
    decidedBy: string | null
    entityType: string
    entityId: string
    maxAuthorizedSpendCents: number | null
  },
  currentGuardrails: OwnerGuardrails,
  currentMetaAdAccountId: string | null
): ExecutionEligibilityResult {
  if (specification.status !== "AUTHORIZED") {
    return {
      status: "NOT_EXECUTABLE",
      reasons: [{ code: "SPECIFICATION_NOT_AUTHORIZED", message: "This exact action has not yet been authorized by the owner." }],
    }
  }
  if (!specification.decidedBy || !specification.decidedAt) {
    return {
      status: "NOT_EXECUTABLE",
      reasons: [{ code: "INVALID_AUTHORIZATION_PROVENANCE", message: "This specification's authorization record is incomplete and cannot be trusted." }],
    }
  }

  return evaluateExecutionEligibility({
    proposal: {
      status: proposal.status,
      solutionCandidateCode: proposal.solutionCandidateCode,
      category: proposal.category,
      createdAt: proposal.createdAt,
      decidedAt: proposal.decidedAt,
      decidedBy: proposal.decidedBy,
      entityType: proposal.entityType,
      entityId: proposal.entityId,
      proposedSpendCents: specification.proposedSpendCents,
      maxAuthorizedSpendCents: proposal.maxAuthorizedSpendCents,
      proposedCurrency: specification.currency,
      targetMetaEntityId: specification.targetEntityId,
      creativeAssetId: specification.creativeAssetId,
    },
    currentGuardrails,
    currentMetaAdAccountId,
  })
}