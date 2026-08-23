/**
 * Owner Goals + Budget + Risk Guardrails V1
 *
 * Pure, deterministic module - no AI/LLM call, no database access.
 * Budget is a hard authorization boundary, not a suggestion: this
 * evaluator is the single source of truth for whether a proposed
 * spend is authorized. Fail-closed: every branch returns an
 * explicit decision; no path defaults to ALLOWED on missing/
 * malformed evidence.
 *
 * V1 EXECUTION BOUNDARY: any EXECUTE_ON_META proposal is ALWAYS
 * NEEDS_OWNER_APPROVAL, unconditionally - regardless of stored
 * authorityMode. Real Meta execution capability does not exist yet.
 */

export type BusinessObjective = "SALES" | "LEADS" | "TRAFFIC" | "AWARENESS"
export type AuthorityMode = "ADVISOR" | "COPILOT" | "AUTOPILOT"
export type GuardrailDecision = "ALLOWED" | "BLOCKED" | "NEEDS_OWNER_APPROVAL" | "INSUFFICIENT_CONFIGURATION"
export type ProposedMediaActionType = "TEST_SPEND" | "DAILY_SPEND" | "EXECUTE_ON_META"

export interface OwnerGoal {
  objective: BusinessObjective | null
  targetRoas: number | null
  targetCpaCents: number | null
}

export interface OwnerGuardrails {
  authorityMode: AuthorityMode | null
  currency: string | null
  monthlyBudgetCents: number | null
  dailyMaximumCents: number | null
  maxTestBudgetCents: number | null
}

export interface ProposedMediaAction {
  type: ProposedMediaActionType
  amountCents: number | null
  currency: string | null
}

export interface GuardrailEvaluation {
  decision: GuardrailDecision
  reasons: string[]
}

export function evaluateProposedMediaAction(
  proposedAction: ProposedMediaAction,
  guardrails: OwnerGuardrails
): GuardrailEvaluation {
  if (proposedAction.type === "EXECUTE_ON_META") {
    return {
      decision: "NEEDS_OWNER_APPROVAL",
      reasons: [
        "V1 execution capability is Advisor-only. No stored authority mode can authorize real Meta execution in this slice.",
      ],
    }
  }

  if (guardrails.authorityMode === null) {
    return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["Authority mode has not been set."] }
  }

  if (guardrails.currency === null) {
    return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["Budget currency has not been set."] }
  }

  if (proposedAction.amountCents === null || proposedAction.currency === null) {
    return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["The proposed action is missing an amount or currency."] }
  }

  if (proposedAction.currency !== guardrails.currency) {
    return {
      decision: "BLOCKED",
      reasons: [
        `Currency mismatch: the proposed action is in ${proposedAction.currency}, but the owner's budget is set in ${guardrails.currency}.`,
      ],
    }
  }

  if (proposedAction.amountCents < 0) {
    return { decision: "BLOCKED", reasons: ["Proposed amount cannot be negative."] }
  }

  if (proposedAction.type === "TEST_SPEND") {
    if (guardrails.maxTestBudgetCents === null) {
      return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["No maximum test budget has been set."] }
    }
    if (proposedAction.amountCents > guardrails.maxTestBudgetCents) {
      return {
        decision: "BLOCKED",
        reasons: [
          `Proposed test spend (${proposedAction.amountCents} cents) exceeds the maximum test budget (${guardrails.maxTestBudgetCents} cents).`,
        ],
      }
    }
    return { decision: "ALLOWED", reasons: ["Proposed test spend is within the owner's authorized test budget."] }
  }

  if (proposedAction.type === "DAILY_SPEND") {
    if (guardrails.dailyMaximumCents === null) {
      return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["No daily maximum has been set."] }
    }
    if (proposedAction.amountCents > guardrails.dailyMaximumCents) {
      return {
        decision: "BLOCKED",
        reasons: [
          `Proposed daily spend (${proposedAction.amountCents} cents) exceeds the daily maximum (${guardrails.dailyMaximumCents} cents).`,
        ],
      }
    }
    return { decision: "ALLOWED", reasons: ["Proposed daily spend is within the owner's authorized daily maximum."] }
  }

  return { decision: "INSUFFICIENT_CONFIGURATION", reasons: ["Unrecognized proposed action type."] }
}
