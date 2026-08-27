/**
 * Solution Engine V1 - deterministic candidate-intervention mapping
 * over an already-produced DiagnosticResult.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY: this module answers "given the
 * supported diagnostic mechanisms and JARVIS's verified
 * capabilities, what interventions are reasonable CANDIDATES to
 * consider?" - never "what should definitely be executed?". The
 * four-layer distinction is strict:
 *   DIAGNOSIS  - what appears to be happening (Diagnostic Engine)
 *   SOLUTION   - what kinds of interventions could address that
 *                mechanism (THIS MODULE)
 *   ACTION PROPOSAL - which specific intervention to ask the owner
 *                to approve (a FUTURE layer, not built here)
 *   EXECUTION  - perform the approved change (a FUTURE layer)
 *
 * HARD INPUT BOUNDARY: the only entry point, runSolutionEngine(),
 * accepts a DiagnosticResult | null plus an explicitly-typed
 * SolutionContext (verified capability/budget/goal context only).
 * It never accepts raw Meta observations, a MonitorResult, an
 * EvidenceGateResult, or a DiagnosticEvidencePacket - diagnosis is
 * never re-derived here.
 *
 * DIAGNOSIS REMAINS IMMUTABLE: this module never rewrites, relabels,
 * or reinterprets a diagnostic hypothesis to justify an
 * intervention. Available tools do not determine the diagnosis.
 *
 * DETERMINISTIC, NO AI: zero network calls, zero AI provider calls,
 * zero side effects. This is a pure function of its two inputs.
 *
 * CREATIVE-BIAS AUDIT: JARVIS has significant creative
 * infrastructure. This module deliberately does NOT recommend a
 * creative candidate merely because creative capability exists -
 * TEST_ALTERNATIVE_CREATIVE is eligible ONLY when
 * CLICK_RESPONSE_WEAKENED is itself SUPPORTED (with confidence not
 * LOW) or PLAUSIBLE, AND a genuinely different creative path is
 * actually known to exist (see ASSET-AVAILABILITY AUDIT below).
 *
 * COMPOUND-ELIGIBILITY AUDIT (closure finding): a secondary usable
 * hypothesis (e.g. COST_PER_RESULT_INCREASED) is recorded in
 * supportedBy purely as CONTEXT - it never upgrades eligibility on
 * its own. primaryMechanism always names the ONE hypothesis whose
 * own status/confidence actually decided the outcome, so a compound
 * diagnosis can never be mistaken for two independent mechanisms
 * both driving the decision.
 *
 * ASSET-AVAILABILITY AUDIT (closure finding): a repeated cycle of
 * "test alternative creative" using the SAME underlying asset (or
 * assuming infinite creative variety merely because SOME creative
 * infrastructure exists) is not a genuine intervention. This module
 * requires explicit evidence (hasEligibleExistingAsset) that a
 * genuinely different creative path exists before ever reaching
 * ELIGIBLE - null (not yet verified, the honest V1 default) yields
 * NEEDS_MORE_INFORMATION, never a silent ELIGIBLE.
 */

import type { DiagnosticResult, HypothesisCode, HypothesisStatus } from "@/lib/product/diagnosticEngine"

export type SolutionCandidateCode = "TEST_ALTERNATIVE_CREATIVE" | "OBSERVE_MORE_DATA"
export type SolutionCandidateStatus = "ELIGIBLE" | "NEEDS_MORE_INFORMATION" | "BLOCKED_BY_GUARDRAIL" | "CAPABILITY_UNAVAILABLE" | "NOT_APPLICABLE"
export type RiskLevel = "LOW" | "MODERATE" | "HIGH"
export type ReversibilityLevel = "REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE" | "NOT_APPLICABLE"

/**
 * Verified capability registry - derived from ACTUAL implemented
 * architecture, never from planned/marketing claims. metaWriteAvailable
 * is always false in V1 (no Meta write provider exists anywhere in
 * this codebase).
 */
export interface SolutionCapabilities {
  creativeLibraryAvailable: boolean
  staticCreativeProductionAvailable: boolean
  metaWriteAvailable: boolean
  /** null = not yet verified for this entity - never guessed. false
   * = explicitly confirmed no eligible existing asset exists. true =
   * explicitly confirmed a genuinely different asset exists. */
  hasEligibleExistingAsset: boolean | null
}

export interface SolutionBudgetContext {
  /** The owner's configured maximum TEST budget, in cents, if any -
   * a CEILING for a future Action Proposal, never a proposed spend
   * amount. null when no budget is configured; never fabricated. */
  maxTestBudgetCents: number | null
  currency: string | null
}

export interface SolutionContext {
  capabilities: SolutionCapabilities
  budget: SolutionBudgetContext
  /** Owner's configured objective, if any. Affects candidate
   * PRIORITIZATION/framing only - never the diagnosis, and never a
   * candidate's eligibility on its own. */
  ownerObjective: string | null
}

export interface SolutionCandidate {
  code: SolutionCandidateCode
  label: string
  category: "EXPERIMENT" | "OBSERVATION"
  rationale: string
  /** The single mechanism that actually determined eligibility - kept
   * separate from supportedBy so a compound diagnosis can never be
   * mistaken for two independent mechanisms both driving the
   * decision. null when the candidate is NOT_APPLICABLE. */
  primaryMechanism: HypothesisCode | null
  supportedBy: HypothesisCode[]
  requires: string[]
  unavailableBecause: string[]
  estimatedRisk: RiskLevel
  /** Always null in V1 unless a real, already-known cost figure
   * exists - never guessed. */
  estimatedCost: number | null
  reversibility: ReversibilityLevel
  status: SolutionCandidateStatus
}

export interface SolutionResult {
  entityType: string
  entityId: string
  currentPeriod: { start: string; end: string }
  comparisonPeriod: { start: string; end: string }
  diagnosticProvenance: HypothesisCode[]
  candidates: SolutionCandidate[]
  unresolvedConstraints: string[]
}

function findHyp(diagnostic: DiagnosticResult, code: HypothesisCode) {
  return diagnostic.hypotheses.find((h) => h.code === code)
}

/**
 * A hypothesis may justify a candidate only when it is SUPPORTED or
 * PLAUSIBLE. CONTRADICTED, INSUFFICIENT_EVIDENCE, and NOT_APPLICABLE
 * are never treated as though they were established.
 */
function isUsable(status: HypothesisStatus | undefined): boolean {
  return status === "SUPPORTED" || status === "PLAUSIBLE"
}

function evaluateTestAlternativeCreative(diagnostic: DiagnosticResult, context: SolutionContext): SolutionCandidate {
  const code: SolutionCandidateCode = "TEST_ALTERNATIVE_CREATIVE"
  const label = "Test an alternative creative"
  const category = "EXPERIMENT" as const
  const primaryMechanism: HypothesisCode = "CLICK_RESPONSE_WEAKENED"

  const clickHyp = findHyp(diagnostic, "CLICK_RESPONSE_WEAKENED")
  const cprHyp = findHyp(diagnostic, "COST_PER_RESULT_INCREASED")

  if (!clickHyp || !isUsable(clickHyp.status)) {
    return {
      code, label, category,
      rationale: "No usable evidence that click response weakened, so a creative experiment is not justified by the current diagnosis.",
      primaryMechanism: null, supportedBy: [], requires: [], unavailableBecause: [],
      estimatedRisk: "LOW", estimatedCost: null, reversibility: "REVERSIBLE",
      status: "NOT_APPLICABLE",
    }
  }

  // COST_PER_RESULT_INCREASED, when also usable, is recorded ONLY as
  // secondary context - primaryMechanism always remains
  // CLICK_RESPONSE_WEAKENED, and eligibility is decided solely from
  // ITS status/confidence, never inflated by a compound secondary
  // signal.
  const supportedBy: HypothesisCode[] = ["CLICK_RESPONSE_WEAKENED"]
  if (cprHyp && isUsable(cprHyp.status)) supportedBy.push("COST_PER_RESULT_INCREASED")

  const requires = ["creativeLibraryAvailable OR staticCreativeProductionAvailable", "hasEligibleExistingAsset (verified)"]
  const productionCapable = context.capabilities.creativeLibraryAvailable || context.capabilities.staticCreativeProductionAvailable
  if (!productionCapable) {
    return {
      code, label, category,
      rationale: "Click response weakened, but no creative library or production capability is currently available to prepare an experiment.",
      primaryMechanism, supportedBy, requires,
      unavailableBecause: ["no creative library or static creative production capability available"],
      estimatedRisk: "LOW", estimatedCost: null, reversibility: "REVERSIBLE",
      status: "CAPABILITY_UNAVAILABLE",
    }
  }

  const assetKnown = context.capabilities.hasEligibleExistingAsset

  // Explicitly known: no eligible existing asset, and no production
  // path exists to make a genuinely new one either.
  if (assetKnown === false && !context.capabilities.staticCreativeProductionAvailable) {
    return {
      code, label, category,
      rationale: "Click response weakened, but no eligible existing creative asset is available and no production capability exists to prepare a genuinely different one.",
      primaryMechanism, supportedBy, requires,
      unavailableBecause: ["no eligible existing creative asset, and no production capability to create a new one"],
      estimatedRisk: "LOW", estimatedCost: null, reversibility: "REVERSIBLE",
      status: "CAPABILITY_UNAVAILABLE",
    }
  }

  // Confidence is checked explicitly here (defense in depth): even
  // if a future Diagnostic Engine change ever paired SUPPORTED with
  // LOW confidence, this module never treats that as fully
  // established on its own.
  const clickConfidentlySupported = clickHyp.status === "SUPPORTED" && clickHyp.confidence !== "LOW"

  // Whether a GENUINELY DIFFERENT creative treatment can actually be
  // prepared has not been verified (assetKnown === null is the
  // honest V1 default) - never silently assumed true merely because
  // some creative capability exists in the codebase.
  if (assetKnown === null) {
    return {
      code, label, category,
      rationale: "Click response weakened. Testing another creative treatment could help, but whether a genuinely different creative option can currently be prepared has not yet been verified.",
      primaryMechanism, supportedBy, requires, unavailableBecause: [],
      estimatedRisk: "LOW", estimatedCost: null, reversibility: "REVERSIBLE",
      status: "NEEDS_MORE_INFORMATION",
    }
  }

  const rationale = clickConfidentlySupported
    ? "Click response weakened. Testing another creative treatment could help determine whether creative presentation contributes to the decline."
    : "Click response may have weakened, though the evidence is not yet fully established. Testing another creative treatment is a low-risk way to gather more information."

  return {
    code, label, category, rationale, primaryMechanism, supportedBy, requires, unavailableBecause: [],
    estimatedRisk: "LOW",
    estimatedCost: null,
    reversibility: "REVERSIBLE",
    status: clickConfidentlySupported ? "ELIGIBLE" : "NEEDS_MORE_INFORMATION",
  }
}

/**
 * OBSERVE_MORE_DATA - the disciplined, always-available fallback.
 * Never a failure state: for DELIVERY_COST_INCREASED,
 * COST_PER_RESULT_INCREASED (alone), and REVENUE_EFFICIENCY_
 * WEAKENED, this is correctly the ONLY candidate produced, since no
 * verified JARVIS capability safely addresses those mechanisms.
 */
function evaluateObserveMoreData(diagnostic: DiagnosticResult): SolutionCandidate {
  const usableCodes = diagnostic.hypotheses.filter((h) => isUsable(h.status)).map((h) => h.code)
  return {
    code: "OBSERVE_MORE_DATA",
    label: "Continue observing",
    category: "OBSERVATION",
    rationale: usableCodes.length > 0
      ? "JARVIS detected a performance change but does not yet have enough evidence or verified capability to identify a safe, specific intervention. Continuing to observe is the disciplined next step."
      : "No performance mechanism is currently established with enough evidence to act on.",
    primaryMechanism: null,
    supportedBy: usableCodes,
    requires: [],
    unavailableBecause: [],
    estimatedRisk: "LOW",
    estimatedCost: null,
    reversibility: "NOT_APPLICABLE",
    status: "ELIGIBLE",
  }
}

/**
 * SOLUTION_RULES - centralized, typed registry. Each entry is a pure
 * function of (diagnostic, context). Note: BLOCKED_BY_GUARDRAIL is
 * declared in SolutionCandidateStatus for future Owner Guardrails
 * integration but is NOT YET produced by any rule below - no * guardrail/authority-mode data flows into SolutionContext in V1.
 */
const SOLUTION_RULES: Array<(diagnostic: DiagnosticResult, context: SolutionContext) => SolutionCandidate> = [
  evaluateTestAlternativeCreative,
  (diagnostic) => evaluateObserveMoreData(diagnostic),
]

/**
 * Single entry point. Accepts ONLY a DiagnosticResult | null plus an
 * explicit SolutionContext. Purely a function of these two inputs:
 * the same DiagnosticResult and the same SolutionContext always
 * produce the same SolutionResult.
 */
export function runSolutionEngine(diagnostic: DiagnosticResult | null, context: SolutionContext): SolutionResult {
  if (!diagnostic || diagnostic.hypotheses.length === 0) {
    return {
      entityType: diagnostic?.entityType ?? "",
      entityId: diagnostic?.entityId ?? "",
      currentPeriod: diagnostic?.currentPeriod ?? { start: "", end: "" },
      comparisonPeriod: diagnostic?.comparisonPeriod ?? { start: "", end: "" },
      diagnosticProvenance: [],
      candidates: [],
      unresolvedConstraints: [],
    }
  }

  const candidates = SOLUTION_RULES.map((rule) => rule(diagnostic, context))
  const diagnosticProvenance = diagnostic.hypotheses.filter((h) => isUsable(h.status)).map((h) => h.code)

  const unresolvedConstraints: string[] = []
  if (context.budget.maxTestBudgetCents !== null) {
    const amount = (context.budget.maxTestBudgetCents / 100).toFixed(2)
    const currencyLabel = context.budget.currency ?? "unspecified currency"
    unresolvedConstraints.push(
      `Any future action involving spend would be capped at ${amount} ${currencyLabel} (the owner's configured maximum test budget) - no specific spend is proposed by any candidate here.`
    )
  }
  if (!context.capabilities.metaWriteAvailable) {
    unresolvedConstraints.push("JARVIS has no Meta write capability in this version - no candidate can be executed automatically.")
  }

  return {
    entityType: diagnostic.entityType,
    entityId: diagnostic.entityId,
    currentPeriod: diagnostic.currentPeriod,
    comparisonPeriod: diagnostic.comparisonPeriod,
    diagnosticProvenance,
    candidates,
    unresolvedConstraints,
  }
}