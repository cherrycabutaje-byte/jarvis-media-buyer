/**
 * Diagnostic Engine V1 - deterministic hypothesis reasoning over
 * already-gated evidence.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY: this module answers "what
 * evidence-supported explanations are consistent with the observed
 * change?" - never "why did it really happen" (root cause) and
 * never "what should we do about it" (recommendation/action). It
 * produces hypotheses about PERFORMANCE MECHANISMS, explicitly
 * distinct from ROOT CAUSES (creative fatigue, audience saturation,
 * offer/landing-page/checkout failure) - root-cause hypotheses
 * remain INSUFFICIENT_EVIDENCE in V1 unless genuinely testable
 * evidence exists, which it currently does not for any root-cause
 * family.
 *
 * HARD INPUT BOUNDARY: the only entry point, runDiagnosticEngine(),
 * accepts exactly one parameter typed as DiagnosticEvidencePacket |
 * null. It cannot accept raw Meta observations, a MonitorResult, or
 * an EvidenceGateResult - enforced by the function's type signature
 * itself. No Evidence Packet, no diagnosis.
 *
 * DETERMINISTIC, NO AI: zero network calls, zero AI provider calls.
 *
 * CORRELATED-METRIC AUDIT (closure finding): CTR = clicks/impressions
 * and CPC = spend/clicks are mathematically coupled through the
 * shared "clicks" variable - if impressions and spend are stable, a
 * change in clicks ALONE moves both CTR and CPC in lockstep. They
 * are therefore NOT two independent pieces of corroborating
 * evidence for "click response weakened", and treating them as such
 * would let a single underlying cause fabricate HIGH confidence.
 * Similarly, CPC itself is approximately CPM / (CTR x 10) - a
 * DERIVED quantity, not an independent measurement. The genuinely
 * independent axes are CPM (delivery cost) and CTR (click
 * efficiency); CPC's movement is used only as corroborating context,
 * never as a second required signal that inflates confidence.
 *
 * Because of this, every rule below treats its OWN primary metric
 * (ctr, cpm, costPerResult, roas) as the single required signal, and
 * checks a genuinely DIFFERENT metric family for a competing/
 * confounding explanation before ever assigning HIGH confidence.
 * When a confound is present, confidence is capped at MODERATE -
 * multiple mathematically related metrics moving together is never
 * by itself sufficient for HIGH.
 */

import type { DiagnosticEvidencePacket } from "@/lib/product/evidenceGate"

export type HypothesisStatus = "SUPPORTED" | "PLAUSIBLE" | "INSUFFICIENT_EVIDENCE" | "CONTRADICTED" | "NOT_APPLICABLE"
export type ConfidenceLevel = "LOW" | "MODERATE" | "HIGH" | null

export type HypothesisCode =
  | "DELIVERY_COST_INCREASED"
  | "CLICK_RESPONSE_WEAKENED"
  | "COST_PER_RESULT_INCREASED"
  | "REVENUE_EFFICIENCY_WEAKENED"
  | "CREATIVE_FATIGUE"
  | "AUDIENCE_SATURATION"

export interface EvidenceReference {
  metric: string
  direction: "UP" | "DOWN" | "UNCHANGED" | null
  percentChange: number | null
  material: boolean
}

export interface DiagnosticHypothesis {
  code: HypothesisCode
  label: string
  category: "PERFORMANCE_MECHANISM" | "ROOT_CAUSE"
  status: HypothesisStatus
  confidence: ConfidenceLevel
  supportingEvidence: EvidenceReference[]
  contradictingEvidence: EvidenceReference[]
  missingEvidence: string[]
}

export interface DiagnosticResult {
  entityType: string
  entityId: string
  currentPeriod: { start: string; end: string }
  comparisonPeriod: { start: string; end: string }
  observedChanges: DiagnosticEvidencePacket["observedChanges"]
  hypotheses: DiagnosticHypothesis[]
  unresolvedQuestions: string[]
  overallState: "NO_DIAGNOSIS" | "MECHANISM_IDENTIFIED" | "MULTIPLE_MECHANISMS"
}

type ObservedChangeEntry = DiagnosticEvidencePacket["observedChanges"][number]

function findChange(packet: DiagnosticEvidencePacket, metric: string): ObservedChangeEntry | undefined {
  return packet.observedChanges.find((c) => c.metric === metric)
}

function toEvidenceRef(c: ObservedChangeEntry): EvidenceReference {
  return { metric: c.metric, direction: c.direction, percentChange: c.percentChange, material: c.material }
}

/**
 * Checks whether a genuinely DIFFERENT metric independently shows a
 * material move in a direction that would ALSO explain the primary
 * signal - i.e. a confound. "ABSENT" (metric not in the packet at
 * all) is treated the same as "STABLE" for confidence purposes: we
 * only cap confidence when a competing explanation is ACTIVELY
 * evidenced, never merely because it could theoretically exist.
 */
function isConfounding(packet: DiagnosticEvidencePacket, metric: string, direction: "UP" | "DOWN"): boolean {
  const c = findChange(packet, metric)
  return c !== undefined && c.material && c.direction === direction
}

function insufficientEvidence(code: HypothesisCode, label: string, category: DiagnosticHypothesis["category"], missing: string[]): DiagnosticHypothesis {
  return { code, label, category, status: "INSUFFICIENT_EVIDENCE", confidence: null, supportingEvidence: [], contradictingEvidence: [], missingEvidence: missing }
}

function notApplicable(code: HypothesisCode, label: string, contradicting: EvidenceReference[] = []): DiagnosticHypothesis {
  return { code, label, category: "PERFORMANCE_MECHANISM", status: "NOT_APPLICABLE", confidence: null, supportingEvidence: [], contradictingEvidence: contradicting, missingEvidence: [] }
}

/**
 * CLICK_RESPONSE_WEAKENED - required signal: ctr (DOWN).
 * Contradicting: clicks materially UP (the decline in rate could
 * not itself be explained by a genuine drop in click volume).
 * cpc, when present and UP, is recorded as corroborating context
 * only - it is NEVER required and never independently raises
 * confidence, since it is mathematically derived from ctr and cpm.
 * Confidence is capped at MODERATE whenever cpm is ALSO materially
 * UP at the same time (a competing delivery-cost explanation for
 * any observed cpc movement exists), and reaches HIGH only when ctr
 * is material and no such confound is present.
 */
function evaluateClickResponseWeakened(packet: DiagnosticEvidencePacket): DiagnosticHypothesis {
  const code: HypothesisCode = "CLICK_RESPONSE_WEAKENED"
  const label = "Click response weakened"
  const ctr = findChange(packet, "ctr")
  if (!ctr) return insufficientEvidence(code, label, "PERFORMANCE_MECHANISM", ["ctr (not present as sufficient evidence in this packet)"])
  if (ctr.direction !== "DOWN") return notApplicable(code, label, ctr.direction ? [toEvidenceRef(ctr)] : [])

  const clicks = findChange(packet, "clicks")
  if (clicks && clicks.material && clicks.direction === "UP") {
    return { code, label, category: "PERFORMANCE_MECHANISM", status: "CONTRADICTED", confidence: null, supportingEvidence: [toEvidenceRef(ctr)], contradictingEvidence: [toEvidenceRef(clicks)], missingEvidence: [] }
  }

  const supportingEvidence = [toEvidenceRef(ctr)]
  const cpc = findChange(packet, "cpc")
  if (cpc && cpc.direction === "UP") supportingEvidence.push(toEvidenceRef(cpc))

  if (!ctr.material) {
    return { code, label, category: "PERFORMANCE_MECHANISM", status: "PLAUSIBLE", confidence: "LOW", supportingEvidence, contradictingEvidence: [], missingEvidence: [] }
  }

  const confounded = isConfounding(packet, "cpm", "UP")
  return {
    code, label, category: "PERFORMANCE_MECHANISM", status: "SUPPORTED",
    confidence: confounded ? "MODERATE" : "HIGH",
    supportingEvidence, contradictingEvidence: [],
    missingEvidence: confounded ? ["a delivery-cost-independent measure to fully separate click response from a concurrent CPM increase"] : [],
  }
}

/**
 * DELIVERY_COST_INCREASED - required signal: cpm (UP). Confidence
 * capped at MODERATE whenever ctr is ALSO materially DOWN at the
 * same time (click response weakening is a competing explanation
 * for any observed cpc movement); HIGH only when cpm is material
 * and ctr shows no such confound.
 */
function evaluateDeliveryCostIncreased(packet: DiagnosticEvidencePacket): DiagnosticHypothesis {
  const code: HypothesisCode = "DELIVERY_COST_INCREASED"
  const label = "Delivery became more expensive"
  const cpm = findChange(packet, "cpm")
  if (!cpm) return insufficientEvidence(code, label, "PERFORMANCE_MECHANISM", ["cpm (not present as sufficient evidence in this packet)"])
  if (cpm.direction !== "UP") return notApplicable(code, label, cpm.direction ? [toEvidenceRef(cpm)] : [])

  const supportingEvidence = [toEvidenceRef(cpm)]
  if (!cpm.material) {
    return { code, label, category: "PERFORMANCE_MECHANISM", status: "PLAUSIBLE", confidence: "LOW", supportingEvidence, contradictingEvidence: [], missingEvidence: [] }
  }

  const confounded = isConfounding(packet, "ctr", "DOWN")
  return {
    code, label, category: "PERFORMANCE_MECHANISM", status: "SUPPORTED",
    confidence: confounded ? "MODERATE" : "HIGH",
    supportingEvidence, contradictingEvidence: [],
    missingEvidence: confounded ? ["a click-response-independent measure to fully separate delivery cost from a concurrent CTR decline"] : [],
  }
}

/**
 * COST_PER_RESULT_INCREASED (renamed from a broader "post-click
 * conversion weakened" claim - closure finding: costPerResult =
 * spend/results = cpc / conversionRate, so it is driven by BOTH
 * upstream acquisition cost (cpc) AND post-click efficiency. The
 * current evidence packet has no direct conversion-rate (results/
 * clicks) signal, so this mechanism deliberately makes NO post-click
 * attribution at all - it only reports the factual cost-per-result
 * trend. Confidence capped at MODERATE whenever cpc is ALSO
 * materially UP (upstream acquisition cost may explain some or all
 * of the movement).
 */
function evaluateCostPerResultIncreased(packet: DiagnosticEvidencePacket): DiagnosticHypothesis {
  const code: HypothesisCode = "COST_PER_RESULT_INCREASED"
  const label = "Cost per result increased"
  const cpr = findChange(packet, "costPerResult")
  if (!cpr) return insufficientEvidence(code, label, "PERFORMANCE_MECHANISM", ["costPerResult (not present as sufficient evidence in this packet)"])
  if (cpr.direction !== "UP") return notApplicable(code, label, cpr.direction ? [toEvidenceRef(cpr)] : [])

  const supportingEvidence = [toEvidenceRef(cpr)]
  if (!cpr.material) {
    return { code, label, category: "PERFORMANCE_MECHANISM", status: "PLAUSIBLE", confidence: "LOW", supportingEvidence, contradictingEvidence: [], missingEvidence: [] }
  }

  const confounded = isConfounding(packet, "cpc", "UP")
  return {
    code, label, category: "PERFORMANCE_MECHANISM", status: "SUPPORTED",
    confidence: confounded ? "MODERATE" : "HIGH",
    supportingEvidence, contradictingEvidence: [],
    missingEvidence: [
      "a direct conversion-rate (results/clicks) signal - this mechanism reports the factual cost-per-result trend only and makes no claim about whether the cause is upstream acquisition cost or post-click efficiency",
    ],
  }
}

/**
 * REVENUE_EFFICIENCY_WEAKENED - required signal: roas (DOWN).
 * Confidence capped at MODERATE whenever results (conversion volume)
 * is ALSO materially DOWN, since a genuine drop in conversion volume
 * is a distinct, confounding explanation for revenue-per-spend
 * decline, separate from a change in value-per-conversion or spend
 * efficiency. No average-order-value metric is fabricated to
 * decompose this further.
 */
function evaluateRevenueEfficiencyWeakened(packet: DiagnosticEvidencePacket): DiagnosticHypothesis {
  const code: HypothesisCode = "REVENUE_EFFICIENCY_WEAKENED"
  const label = "Revenue return on spend weakened"
  const roas = findChange(packet, "roas")
  if (!roas) return insufficientEvidence(code, label, "PERFORMANCE_MECHANISM", ["roas (not present as sufficient evidence in this packet)"])
  if (roas.direction !== "DOWN") return notApplicable(code, label, roas.direction ? [toEvidenceRef(roas)] : [])

  const supportingEvidence = [toEvidenceRef(roas)]
  if (!roas.material) {
    return { code, label, category: "PERFORMANCE_MECHANISM", status: "PLAUSIBLE", confidence: "LOW", supportingEvidence, contradictingEvidence: [], missingEvidence: [] }
  }

  const confounded = isConfounding(packet, "results", "DOWN")
  return {
    code, label, category: "PERFORMANCE_MECHANISM", status: "SUPPORTED",
    confidence: confounded ? "MODERATE" : "HIGH",
    supportingEvidence, contradictingEvidence: [],
    missingEvidence: confounded
      ? ["a separate average-order-value signal to distinguish a genuine conversion-volume decline from a per-conversion value or spend-efficiency change"]
      : [],
  }
}

function alwaysInsufficientRootCause(code: HypothesisCode, label: string, missingEvidence: string[]): DiagnosticHypothesis {
  return { code, label, category: "ROOT_CAUSE", status: "INSUFFICIENT_EVIDENCE", confidence: null, supportingEvidence: [], contradictingEvidence: [], missingEvidence }
}
/**
 * DIAGNOSTIC_RULES - centralized, typed registry. Each entry is a
 * pure function of the packet.
 */
const DIAGNOSTIC_RULES: Array<(packet: DiagnosticEvidencePacket) => DiagnosticHypothesis> = [
  evaluateDeliveryCostIncreased,
  evaluateClickResponseWeakened,
  evaluateCostPerResultIncreased,
  evaluateRevenueEfficiencyWeakened,
  () =>
    alwaysInsufficientRootCause("CREATIVE_FATIGUE", "Creative fatigue", [
      "reliable frequency history",
      "creative age / time-running",
      "repeated-exposure trend across multiple periods",
    ]),
  () =>
    alwaysInsufficientRootCause("AUDIENCE_SATURATION", "Audience saturation", [
      "audience size / saturation data",
      "reach and frequency trend across multiple periods",
    ]),
]

/**
 * Single entry point. Accepts ONLY a DiagnosticEvidencePacket (or
 * null). Purely a function of its input - the same packet always
 * produces the same DiagnosticResult (no timestamps, randomness, or
 * runtime-dependent values are read anywhere in this module).
 */
export function runDiagnosticEngine(packet: DiagnosticEvidencePacket | null): DiagnosticResult {
  if (!packet || packet.observedChanges.length === 0) {
    return {
      entityType: packet?.entityType ?? "",
      entityId: packet?.entityId ?? "",
      currentPeriod: packet?.currentPeriod ?? { start: "", end: "" },
      comparisonPeriod: packet?.comparisonPeriod ?? { start: "", end: "" },
      observedChanges: [],
      hypotheses: [],
      unresolvedQuestions: [],
      overallState: "NO_DIAGNOSIS",
    }
  }

  const hypotheses = DIAGNOSTIC_RULES.map((rule) => rule(packet))
  const identifiedCount = hypotheses.filter((h) => h.status === "SUPPORTED" || h.status === "PLAUSIBLE").length

  const overallState: DiagnosticResult["overallState"] =
    identifiedCount === 0 ? "NO_DIAGNOSIS" : identifiedCount === 1 ? "MECHANISM_IDENTIFIED" : "MULTIPLE_MECHANISMS"

  const unresolvedQuestions: string[] = []
  if (identifiedCount > 0) {
    unresolvedQuestions.push(
      "Root cause (e.g. creative fatigue, audience saturation, offer/landing-page/checkout issues) has not been established from the currently available evidence."
    )
  }

  return {
    entityType: packet.entityType,
    entityId: packet.entityId,
    currentPeriod: packet.currentPeriod,
    comparisonPeriod: packet.comparisonPeriod,
    observedChanges: packet.observedChanges,
    hypotheses,
    unresolvedQuestions,
    overallState,
  }
}