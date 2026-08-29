/**
 * Owner Approval Workflow V1 - deterministic decision validation
 * over an already-persisted Action Proposal, plus deterministic
 * staleness evaluation.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY: this module answers "is this
 * owner decision (approve/decline) legally applicable to this
 * proposal's current state and age?" - it NEVER executes anything,
 * NEVER calls Meta, and NEVER changes what happens after a decision
 * is recorded. Approving a proposal in V1 means exactly one thing:
 * the proposal's own status field changes from PENDING_OWNER_REVIEW
 * to APPROVED (or DECLINED, or EXPIRED) - nothing else happens.
 * Execution of an approved proposal is explicitly a FUTURE slice's
 * responsibility, not this one's.
 *
 * FINAL V1 LIFECYCLE (all three are terminal - none transitions to
 * another state):
 *
 *                    +-- APPROVED
 *                    |
 *   PENDING_OWNER_REVIEW
 *                    |
 *                    +-- DECLINED
 *                    |
 *                    +-- EXPIRED
 *
 * ONLY A PENDING PROPOSAL CAN BE DECIDED: a proposal already
 * APPROVED, DECLINED, or EXPIRED cannot be decided again - this is
 * validated here AND enforced atomically at the database layer
 * (the repository's own UPDATE ... WHERE status = 'PENDING_OWNER_REVIEW'
 * guard), so even a race between two simultaneous decisions (or a
 * decision racing an expiration) can never produce two conflicting
 * outcomes.
 *
 * GUARDRAIL DECISION DOES NOT GATE APPROVAL: an owner may approve a
 * proposal regardless of its own guardrail_decision (ALLOWED,
 * BLOCKED, or INSUFFICIENT_CONFIGURATION) - approval in V1 carries
 * no execution consequence, so there is nothing yet for the
 * guardrail to meaningfully block. The Risk Guard's real
 * enforcement point remains at a future EXECUTION layer, not here.
 *
 * STALENESS AUDIT (closure finding): an unlimited-age proposal could
 * previously still be approved, since no freshness concept existed
 * at all. This module now enforces a bounded review window:
 * proposals older than ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS can no
 * longer be approved or declined - they transition to EXPIRED
 * instead, regardless of which decision the owner attempted.
 */

export type OwnerDecisionType = "APPROVE" | "DECLINE"
export type ActionProposalStatus = "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED"
export type FreshnessStatus = "FRESH" | "EXPIRED" | "INVALID"

/**
 * 72 hours is an engineering safety default for V1. It is NOT a Meta
 * Ads benchmark and NOT a claim that advertising evidence is
 * universally valid for 72 hours. We are using a conservative
 * bounded review window so a persisted proposal cannot remain
 * approval-eligible indefinitely - matching the same kind of
 * engineering-default reasoning already used elsewhere in this
 * codebase (e.g. Evidence Gate's own FRESHNESS_MAX_AGE_HOURS).
 */
export const ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS = 72

export interface OwnerDecisionValidationResult {
  valid: boolean
  resultingStatus: "APPROVED" | "DECLINED" | "EXPIRED" | null
  reason: string | null
}

const DECISION_TO_STATUS: Record<OwnerDecisionType, "APPROVED" | "DECLINED"> = {
  APPROVE: "APPROVED",
  DECLINE: "DECLINED",
}

/**
 * Pure, deterministic staleness evaluation. `now` is always injected
 * by the caller (never read internally via Date.now()) so this
 * function is fully testable and never silently depends on runtime
 * clock state.
 *
 * Boundary semantics (explicit, tested):
 *   age <  ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS -> FRESH
 *   age >= ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS -> EXPIRED
 * A malformed/unparseable createdAt fails closed to INVALID, which
 * is treated identically to EXPIRED by every caller in this module -
 * an unusable timestamp can never result in APPROVED.
 */
export function evaluateActionProposalFreshness(createdAt: string, now: Date): FreshnessStatus {
  const createdAtMs = Date.parse(createdAt)
  if (Number.isNaN(createdAtMs)) {
    return "INVALID"
  }

  const ageHours = (now.getTime() - createdAtMs) / (1000 * 60 * 60)

  if (ageHours < 0) {
    // A created_at in the future is itself malformed/untrustworthy -
    // fails closed rather than being treated as "very fresh".
    return "INVALID"
  }

  return ageHours >= ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS ? "EXPIRED" : "FRESH"
}

/**
 * Pure validation - given the proposal's CURRENT status, its
 * freshness, and the requested decision, determines the legal
 * resulting status. Never touches a database; the repository layer
 * is responsible for re-checking this same condition atomically at
 * write time.
 *
 * A stale (EXPIRED or INVALID-timestamp) proposal is NEVER decided
 * as APPROVED or DECLINED, regardless of which decision was
 * requested - it always resolves to EXPIRED instead.
 */
export function validateOwnerDecision(
  currentStatus: ActionProposalStatus,
  decision: OwnerDecisionType,
  freshness: FreshnessStatus
): OwnerDecisionValidationResult {
  if (currentStatus !== "PENDING_OWNER_REVIEW") {
    return {
      valid: false,
      resultingStatus: null,
      reason: `This proposal is already ${currentStatus.toLowerCase().replace(/_/g, " ")} and cannot be decided again.`,
    }
  }

  if (freshness !== "FRESH") {
    return {
      valid: true,
      resultingStatus: "EXPIRED",
      reason: null,
    }
  }

  return {
    valid: true,
    resultingStatus: DECISION_TO_STATUS[decision],
    reason: null,
  }
}