/**
 * Evidence Gate V1 - pure deterministic evidence sufficiency check.
 *
 * PERMANENT ARCHITECTURAL BOUNDARY: this module answers exactly one
 * question - "does JARVIS have enough reliable evidence to permit a
 * future Diagnostic Engine to investigate this observed change?" It
 * never answers "why did this happen" and never produces a
 * diagnosis, root cause, or recommendation of any kind.
 *
 * FAIL CLOSED: every unknown, malformed, contradictory, unsupported,
 * or incomplete input path returns INSUFFICIENT/NOT_APPLICABLE, never
 * SUFFICIENT by default. The burden is always on the evidence to
 * prove readiness, never the reverse.
 *
 * DOES NOT DUPLICATE PERFORMANCE MONITOR: this module consumes
 * Performance Monitor's already-computed MonitorResult (specifically
 * each ObservedChange's own metric-family-aware sufficientEvidence
 * flag) rather than re-deriving materiality or re-implementing
 * sufficiency thresholds. Evidence Gate adds exactly the dimensions
 * Performance Monitor does not already cover: comparison-identity
 * validity, currency-consistency-per-signal, and freshness.
 */

import { DEFAULT_SUFFICIENCY_THRESHOLDS } from "@/lib/product/performanceAggregation"
import type { AggregatedMetrics, MonitorResult, ObservedChange } from "@/lib/product/performanceAggregation"

export type EvidenceStatus = "SUFFICIENT" | "INSUFFICIENT" | "NOT_APPLICABLE"
export type OverallGateStatus = "SUFFICIENT" | "INSUFFICIENT" | "PARTIALLY_SUFFICIENT" | "NOT_APPLICABLE"

export type EvidenceReasonCode =
  | "MISSING_CURRENT_DATA"
  | "MISSING_COMPARISON_DATA"
  | "PERIOD_MISMATCH"
  | "PERIOD_OVERLAP"
  | "PERIOD_REVERSED"
  | "ENTITY_MISMATCH"
  | "ENTITY_TYPE_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "INSUFFICIENT_IMPRESSIONS"
  | "INSUFFICIENT_CLICKS"
  | "INSUFFICIENT_SPEND"
  | "INSUFFICIENT_RESULTS"
  | "MISSING_REQUIRED_METRIC"
  | "STALE_OBSERVATION"
  | "UNSUPPORTED_METRIC"
  | "MALFORMED_INPUT"

/**
 * Every field a future Diagnostic Engine needs to trace a gate
 * decision back to its exact source - never handed evidence
 * detached from provenance.
 */
export interface EvidenceContext {
  workspaceId: string
  brandId: string
  metaAdAccountLinkId: string
  entityType: string
  entityId: string
  comparisonEntityType: string
  comparisonEntityId: string
  comparisonWorkspaceId: string
  currentPeriod: { start: string; end: string }
  comparisonPeriod: { start: string; end: string }
  currentObservationSyncedAt: string | null
  isHistoricalAnalysis: boolean
}

export interface SignalEvidenceResult {
  metric: string
  status: EvidenceStatus
  reasons: EvidenceReasonCode[]
}

export interface EvidenceGateResult {
  overallStatus: OverallGateStatus
  comparisonValid: boolean
  comparisonReasons: EvidenceReasonCode[]
  signals: SignalEvidenceResult[]
}

/**
 * V1 engineering default, not a real-time guarantee and not an
 * advertising benchmark: an observation whose last sync is older
 * than this is considered stale for CURRENT MONITORING purposes.
 * Explicit historical-analysis requests bypass this check entirely,
 * since Meta attribution can genuinely revise historical performance
 * data and an old reporting period is not itself invalid evidence
 * when the user is intentionally examining history.
 */
export const FRESHNESS_MAX_AGE_HOURS = 72

function checkComparisonValidity(context: EvidenceContext): { valid: boolean; reasons: EvidenceReasonCode[] } {
  const reasons: EvidenceReasonCode[] = []

  if (context.entityType !== context.comparisonEntityType) {
    reasons.push("ENTITY_TYPE_MISMATCH")
  }
  if (context.entityId !== context.comparisonEntityId) {
    reasons.push("ENTITY_MISMATCH")
  }
  if (context.workspaceId !== context.comparisonWorkspaceId) {
    reasons.push("WORKSPACE_MISMATCH")
  }

  const curStart = Date.parse(context.currentPeriod.start)
  const curEnd = Date.parse(context.currentPeriod.end)
  const cmpStart = Date.parse(context.comparisonPeriod.start)
  const cmpEnd = Date.parse(context.comparisonPeriod.end)

  if (Number.isNaN(curStart) || Number.isNaN(curEnd) || Number.isNaN(cmpStart) || Number.isNaN(cmpEnd) || curStart > curEnd || cmpStart > cmpEnd) {
    // A period whose own start is after its own end is malformed
    // input, not a comparison-semantics question - fails closed.
    reasons.push("MALFORMED_INPUT")
  } else {
    const overlaps = curStart <= cmpEnd && cmpStart <= curEnd
    if (overlaps) {
      reasons.push("PERIOD_OVERLAP")
    } else if (curStart < cmpStart) {
      // The "current" period must chronologically follow the
      // "comparison" period - a reversed pair is never silently
      // accepted as if it were intentional.
      reasons.push("PERIOD_REVERSED")
    }
  }

  return { valid: reasons.length === 0, reasons }
}

function checkFreshness(context: EvidenceContext): EvidenceReasonCode[] {
  if (context.isHistoricalAnalysis) {
    // Explicit historical analysis intentionally examines old data -
    // an old reporting period is not itself invalid evidence here.
    return []
  }
  if (!context.currentObservationSyncedAt) {
    // No sync timestamp at all - fails closed rather than assuming
    // freshness.
    return ["STALE_OBSERVATION"]
  }
  const syncedAt = Date.parse(context.currentObservationSyncedAt)
  if (Number.isNaN(syncedAt)) {
    return ["STALE_OBSERVATION"]
  }
  const ageHours = (Date.now() - syncedAt) / (1000 * 60 * 60)
  return ageHours > FRESHNESS_MAX_AGE_HOURS ? ["STALE_OBSERVATION"] : []
}

const MONETARY_METRICS = new Set(["spend", "cpc", "cpm", "costPerResult", "roas"])

const SUFFICIENCY_REASON_BY_METRIC: Record<string, EvidenceReasonCode> = {
  spend: "INSUFFICIENT_SPEND",
  cpc: "INSUFFICIENT_SPEND",
  cpm: "INSUFFICIENT_SPEND",
  clicks: "INSUFFICIENT_CLICKS",
  ctr: "INSUFFICIENT_IMPRESSIONS",
  impressions: "INSUFFICIENT_IMPRESSIONS",
  results: "INSUFFICIENT_RESULTS",
  costPerResult: "INSUFFICIENT_RESULTS",
  roas: "INSUFFICIENT_RESULTS",
}

// Compound metrics are gated by more than one independent
// sufficiency dimension (e.g. costPerResult/roas need BOTH adequate
// spend AND adequate conversion volume). A single static reason per
// metric name would misattribute the cause when only one of the two
// dimensions actually failed - this table lists every reason that
// COULD apply to a given metric, and the caller narrows it down to
// the ones that genuinely failed.
const APPLICABLE_REASONS_BY_METRIC: Record<string, { reason: EvidenceReasonCode; failed: (spendOk: boolean, resultsOk: boolean, impressionsOk: boolean) => boolean }[]> = {
  spend: [{ reason: "INSUFFICIENT_SPEND", failed: (s) => !s }],
  cpc: [{ reason: "INSUFFICIENT_SPEND", failed: (s) => !s }],
  cpm: [{ reason: "INSUFFICIENT_SPEND", failed: (s) => !s }],
  clicks: [{ reason: "INSUFFICIENT_IMPRESSIONS", failed: (_s, _r, i) => !i }],
  ctr: [{ reason: "INSUFFICIENT_IMPRESSIONS", failed: (_s, _r, i) => !i }],
  impressions: [],
  results: [{ reason: "INSUFFICIENT_RESULTS", failed: (_s, r) => !r }],
  costPerResult: [
    { reason: "INSUFFICIENT_SPEND", failed: (s) => !s },
    { reason: "INSUFFICIENT_RESULTS", failed: (_s, r) => !r },
  ],
  roas: [
    { reason: "INSUFFICIENT_SPEND", failed: (s) => !s },
    { reason: "INSUFFICIENT_RESULTS", failed: (_s, r) => !r },
  ],
}

function evaluateSignalEvidence(
  change: ObservedChange,
  comparisonValid: boolean,
  comparisonReasons: EvidenceReasonCode[],
  freshnessReasons: EvidenceReasonCode[],
  currencyConsistent: boolean,
  spendOk: boolean,
  resultsOk: boolean,
  impressionsOk: boolean
): SignalEvidenceResult {
  if (!(change.metric in SUFFICIENCY_REASON_BY_METRIC)) {
    return { metric: change.metric, status: "NOT_APPLICABLE", reasons: ["UNSUPPORTED_METRIC"] }
  }

  if (!comparisonValid) {
    return { metric: change.metric, status: "INSUFFICIENT", reasons: [...comparisonReasons] }
  }

  const reasons: EvidenceReasonCode[] = [...freshnessReasons]

  if (change.currentValue === null) reasons.push("MISSING_CURRENT_DATA")
  if (change.previousValue === null) reasons.push("MISSING_COMPARISON_DATA")

  if (MONETARY_METRICS.has(change.metric) && !currencyConsistent) {
    reasons.push("CURRENCY_MISMATCH")
  }

  if (!change.sufficientEvidence) {
    // Attribute exactly which dimension(s) actually failed, rather
    // than a single static reason that could misattribute a
    // compound metric's true cause.
    const applicable = APPLICABLE_REASONS_BY_METRIC[change.metric] ?? []
    const attributed = applicable.filter((r) => r.failed(spendOk, resultsOk, impressionsOk)).map((r) => r.reason)
    if (attributed.length > 0) {
      reasons.push(...attributed)
    } else {
      // Reuse Performance Monitor's own metric-family-aware
      // sufficiency signal as a fallback if no specific dimension
      // was attributable - never silently drop the failure.
      reasons.push(SUFFICIENCY_REASON_BY_METRIC[change.metric])
    }
  }

  const status: EvidenceStatus = reasons.length === 0 ? "SUFFICIENT" : "INSUFFICIENT"
  return { metric: change.metric, status, reasons }
}

/**
 * The single entry point: evaluates evidence sufficiency for every
 * signal in a Performance Monitor result, then derives one overall
 * gate status. Never diagnoses, never recommends.
 */
export function evaluateEvidence(
  context: EvidenceContext,
  current: AggregatedMetrics,
  previous: AggregatedMetrics,
  monitor: MonitorResult
): EvidenceGateResult {
  const comparisonCheck = checkComparisonValidity(context)
  const freshnessReasons = checkFreshness(context)
  const currencyConsistent = current.currency !== null && current.currency === previous.currency

  // Re-derives the same three per-dimension sufficiency booleans
  // Performance Monitor computes internally (identical threshold
  // values, imported directly to avoid drift) - needed here only to
  // attribute WHICH dimension caused a compound metric's failure,
  // never to re-decide sufficiency itself (that remains
  // change.sufficientEvidence, Performance Monitor's own verdict).
  const t = DEFAULT_SUFFICIENCY_THRESHOLDS
  const ctrSufficient = (current.totalImpressions ?? 0) >= t.minImpressionsForCtr && (previous.totalImpressions ?? 0) >= t.minImpressionsForCtr
  const cpaSufficient = currencyConsistent && (current.totalSpend ?? 0) >= t.minSpendUnitsForCpa && (previous.totalSpend ?? 0) >= t.minSpendUnitsForCpa
  const roasSufficient = (current.totalResults ?? 0) >= t.minConversionsForRoas && (previous.totalResults ?? 0) >= t.minConversionsForRoas

  const signals = monitor.changes.map((c) =>
    evaluateSignalEvidence(c, comparisonCheck.valid, comparisonCheck.reasons, freshnessReasons, currencyConsistent, cpaSufficient, roasSufficient, ctrSufficient)
  )

  let overallStatus: OverallGateStatus
  if (!comparisonCheck.valid || signals.length === 0) {
    overallStatus = signals.length === 0 ? "NOT_APPLICABLE" : "INSUFFICIENT"
  } else {
    const applicable = signals.filter((s) => s.status !== "NOT_APPLICABLE")
    const sufficientCount = applicable.filter((s) => s.status === "SUFFICIENT").length
    if (applicable.length === 0) {
      overallStatus = "NOT_APPLICABLE"
    } else if (sufficientCount === applicable.length) {
      overallStatus = "SUFFICIENT"
    } else if (sufficientCount === 0) {
      overallStatus = "INSUFFICIENT"
    } else {
      overallStatus = "PARTIALLY_SUFFICIENT"
    }
  }

  return { overallStatus, comparisonValid: comparisonCheck.valid, comparisonReasons: comparisonCheck.reasons, signals }
}

/**
 * Diagnostic Evidence Packet - a structured factual payload a future
 * Diagnostic Engine may consume. Contains facts, provenance, and the
 * gate decision only - never a diagnosis, cause, or recommendation.
 * Only SUFFICIENT signals are included; INSUFFICIENT signals are
 * silently excluded rather than passed through with a caveat, so the
 * Diagnostic Engine can never accidentally reason over evidence that
 * did not pass the gate.
 */
export interface DiagnosticEvidencePacket {
  workspaceId: string
  brandId: string
  entityType: string
  entityId: string
  currentPeriod: { start: string; end: string }
  comparisonPeriod: { start: string; end: string }
  observedChanges: Array<{
    metric: string
    previousValue: number | null
    currentValue: number | null
    absoluteChange: number | null
    percentChange: number | null
  }>
  evidenceStatus: "SUFFICIENT" | "PARTIALLY_SUFFICIENT"
}

export function buildDiagnosticEvidencePacket(
  context: EvidenceContext,
  gateResult: EvidenceGateResult,
  monitor: MonitorResult
): DiagnosticEvidencePacket | null {
  if (gateResult.overallStatus !== "SUFFICIENT" && gateResult.overallStatus !== "PARTIALLY_SUFFICIENT") {
    return null
  }

  const sufficientMetrics = new Set(gateResult.signals.filter((s) => s.status === "SUFFICIENT").map((s) => s.metric))
  const observedChanges = monitor.changes
    .filter((c) => sufficientMetrics.has(c.metric))
    .map((c) => ({
      metric: c.metric,
      previousValue: c.previousValue,
      currentValue: c.currentValue,
      absoluteChange: c.absoluteChange,
      percentChange: c.percentChange,
    }))

  if (observedChanges.length === 0) {
    return null
  }

  return {
    workspaceId: context.workspaceId,
    brandId: context.brandId,
    entityType: context.entityType,
    entityId: context.entityId,
    currentPeriod: context.currentPeriod,
    comparisonPeriod: context.comparisonPeriod,
    observedChanges,
    evidenceStatus: gateResult.overallStatus,
  }
}
