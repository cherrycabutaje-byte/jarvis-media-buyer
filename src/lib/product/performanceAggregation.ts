/**
 * Performance Monitor V1 - pure aggregation module.
 *
 * STRICT BOUNDARY: arithmetic only - sums, ratios, period-over-
 * period deltas. NEVER produces a judgment, label, recommendation,
 * or classification (no "good"/"bad"/"improving"/"declining"/
 * "underperforming"). Every output field is a raw number or null.
 * This is Performance Monitor, not Diagnostic Engine or Solution
 * Engine - those remain explicitly out of scope.
 *
 * MISSING vs ZERO: summing a list where every value is null yields
 * null, never a fabricated 0. Real zeros are correctly included in
 * sums. A derived ratio is only computed when its real components
 * are actually present, and is computed as a RATIO OF SUMS (never
 * an average of per-row ratios) - averaging pre-computed CTR/CPC/
 * CPM/CPA/ROAS values across rows of different sizes would silently
 * over-weight small-volume rows and produce a mathematically wrong
 * answer.
 *
 * REACH IS NOT ADDITIVE: reach is a deduplicated unique-person
 * count. Summing reach across more than one row/entity can double-
 * count the same person and is only ever reported as an upper-bound
 * approximation (totalReach), never presented as a true unique
 * count when aggregating multiple rows.
 *
 * FREQUENCY: because frequency = impressions / reach and reach is
 * not safely additive, an aggregate frequency computed from a
 * naively-summed reach would be dishonest. When exactly one
 * observation row is present, Meta's own reported frequency for
 * that single row is passed through directly (it is genuinely
 * accurate for that one real observation). When more than one row
 * is aggregated, frequency is reported as unavailable rather than
 * fabricated from a mathematically invalid denominator.
 *
 * CURRENCY: never assumed to be USD. Preserved from the observation
 * rows; reported only when every row genuinely shares the same
 * currency, null when absent or mixed.
 */

export interface RawObservationRow {
  spend: number | null
  impressions: number | null
  reach: number | null
  frequency: number | null
  clicks: number | null
  linkClicks: number | null
  results: number | null
  purchaseConversionValue: number | null
  currency: string | null
}

export interface AggregatedMetrics {
  observationCount: number
  currency: string | null
  totalSpend: number | null
  totalImpressions: number | null
  totalReach: number | null
  totalClicks: number | null
  totalLinkClicks: number | null
  totalResults: number | null
  totalPurchaseConversionValue: number | null
  averageCpm: number | null
  averageCtr: number | null
  averageCpc: number | null
  averageCostPerResult: number | null
  averageRoas: number | null
  averageFrequency: number | null
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((acc, v) => acc + v, 0)
}

function detectCurrency(rows: RawObservationRow[]): string | null {
  const currencies = new Set(rows.map((r) => r.currency).filter((c): c is string => c !== null))
  if (currencies.size !== 1) return null
  return [...currencies][0]
}

export function aggregateObservations(rows: RawObservationRow[]): AggregatedMetrics {
  const totalSpend = sumNullable(rows.map((r) => r.spend))
  const totalImpressions = sumNullable(rows.map((r) => r.impressions))
  const totalReach = sumNullable(rows.map((r) => r.reach))
  const totalClicks = sumNullable(rows.map((r) => r.clicks))
  const totalLinkClicks = sumNullable(rows.map((r) => r.linkClicks))
  const totalResults = sumNullable(rows.map((r) => r.results))
  const totalPurchaseConversionValue = sumNullable(rows.map((r) => r.purchaseConversionValue))

  // Ratio-of-sums, never average-of-ratios.
  const averageCpm =
    totalSpend !== null && totalImpressions !== null && totalImpressions > 0
      ? (totalSpend / totalImpressions) * 1000
      : null
  const averageCtr =
    totalClicks !== null && totalImpressions !== null && totalImpressions > 0
      ? (totalClicks / totalImpressions) * 100
      : null
  const averageCpc = totalSpend !== null && totalClicks !== null && totalClicks > 0 ? totalSpend / totalClicks : null
  const averageCostPerResult =
    totalSpend !== null && totalResults !== null && totalResults > 0 ? totalSpend / totalResults : null
  const averageRoas =
    totalPurchaseConversionValue !== null && totalSpend !== null && totalSpend > 0
      ? totalPurchaseConversionValue / totalSpend
      : null

  // See module docstring: frequency is only honestly available when
  // exactly one real observation row exists - never re-derived from
  // a naively-summed reach across multiple rows.
  const averageFrequency = rows.length === 1 ? rows[0].frequency : null

  return {
    observationCount: rows.length,
    currency: detectCurrency(rows),
    totalSpend,
    totalImpressions,
    totalReach,
    totalClicks,
    totalLinkClicks,
    totalResults,
    totalPurchaseConversionValue,
    averageCpm,
    averageCtr,
    averageCpc,
    averageCostPerResult,
    averageRoas,
    averageFrequency,
  }
}

export interface MetricDelta {
  currentValue: number | null
  previousValue: number | null
  absoluteChange: number | null
  percentChange: number | null
}

export interface PeriodComparison {
  spend: MetricDelta
  impressions: MetricDelta
  clicks: MetricDelta
  results: MetricDelta
  ctr: MetricDelta
  cpc: MetricDelta
  cpm: MetricDelta
  costPerResult: MetricDelta
  roas: MetricDelta
}

function computeDelta(current: number | null, previous: number | null): MetricDelta {
  if (current === null || previous === null) {
    return { currentValue: current, previousValue: previous, absoluteChange: null, percentChange: null }
  }
  const absoluteChange = current - previous
  const percentChange = previous !== 0 ? (absoluteChange / previous) * 100 : null
  return { currentValue: current, previousValue: previous, absoluteChange, percentChange }
}

export function comparePeriods(current: AggregatedMetrics, previous: AggregatedMetrics): PeriodComparison {
  return {
    spend: computeDelta(current.totalSpend, previous.totalSpend),
    impressions: computeDelta(current.totalImpressions, previous.totalImpressions),
    clicks: computeDelta(current.totalClicks, previous.totalClicks),
    results: computeDelta(current.totalResults, previous.totalResults),
    ctr: computeDelta(current.averageCtr, previous.averageCtr),
    cpc: computeDelta(current.averageCpc, previous.averageCpc),
    cpm: computeDelta(current.averageCpm, previous.averageCpm),
    costPerResult: computeDelta(current.averageCostPerResult, previous.averageCostPerResult),
    roas: computeDelta(current.averageRoas, previous.averageRoas),
  }
}

/**
 * Materiality/sufficiency layer - still purely deterministic, still
 * zero diagnosis. Answers "what changed" and "is there enough
 * evidence to say so" - never "why" and never "what to do about it".
 *
 * METRIC-FAMILY THRESHOLDS (CTO closure review): a single universal
 * percentage does not carry equivalent meaning across raw COUNT
 * metrics (spend, impressions, clicks, results) and derived RATIO
 * metrics (CTR, CPC, CPM, cost-per-result, ROAS) - a ratio combines
 * two independently-noisy signals, so it is given a modestly higher
 * threshold. These are ENGINEERING DEFAULTS for change detection,
 * NOT advertising-performance benchmarks, and are NOT empirically
 * validated - they exist only to separate obvious noise from a
 * genuinely meaningful shift, and are deliberately centralized in
 * one exported table so they are easy to revise.
 */

export type MetricFamily = "COUNT" | "RATIO"

export interface MaterialityRule {
  family: MetricFamily
  percentThreshold: number
}

export const MATERIALITY_RULES: Record<string, MaterialityRule> = {
  spend: { family: "COUNT", percentThreshold: 20 },
  impressions: { family: "COUNT", percentThreshold: 20 },
  clicks: { family: "COUNT", percentThreshold: 20 },
  results: { family: "COUNT", percentThreshold: 20 },
  ctr: { family: "RATIO", percentThreshold: 25 },
  cpc: { family: "RATIO", percentThreshold: 25 },
  cpm: { family: "RATIO", percentThreshold: 25 },
  costPerResult: { family: "RATIO", percentThreshold: 25 },
  roas: { family: "RATIO", percentThreshold: 25 },
}

export interface SufficiencyThresholds {
  minImpressionsForCtr: number
  minSpendUnitsForCpa: number
  minConversionsForRoas: number
}

/**
 * Spend-based sufficiency is expressed in CURRENCY UNITS of
 * whatever currency the observations are actually reported in - it
 * is never assumed to be USD, never converted, and never silently
 * relabeled. If observations across the compared periods do not
 * share a single detected currency, spend-based sufficiency fails
 * closed (never sufficient) rather than comparing incompatible
 * units.
 */
export const DEFAULT_SUFFICIENCY_THRESHOLDS: SufficiencyThresholds = {
  minImpressionsForCtr: 100,
  minSpendUnitsForCpa: 5,
  minConversionsForRoas: 3,
}

export type ChangeDirection = "UP" | "DOWN" | "UNCHANGED" | null

export interface ObservedChange {
  metric: string
  previousValue: number | null
  currentValue: number | null
  absoluteChange: number | null
  percentChange: number | null
  direction: ChangeDirection
  material: boolean
  sufficientEvidence: boolean
}

export type MonitorStatus = "INSUFFICIENT_DATA" | "STABLE" | "CHANGE_DETECTED" | "ATTENTION_REQUIRED"

export interface MonitorResult {
  status: MonitorStatus
  changes: ObservedChange[]
}

function evaluateChange(
  metric: string,
  delta: MetricDelta,
  sufficientEvidence: boolean,
  zeroBaselineMinimum?: number
): ObservedChange {
  // Direction is a plain factual observation, entirely independent
  // of materiality - "DOWN" never implies "bad", "UP" never implies
  // "good". Neither field is derived from the other.
  const direction: ChangeDirection =
    delta.absoluteChange === null ? null : delta.absoluteChange > 0 ? "UP" : delta.absoluteChange < 0 ? "DOWN" : "UNCHANGED"

  const rule = MATERIALITY_RULES[metric]
  let material = false
  if (rule) {
    if (sufficientEvidence && delta.percentChange !== null) {
      material = Math.abs(delta.percentChange) >= rule.percentThreshold
    } else if (
      rule.family === "COUNT" &&
      delta.previousValue === 0 &&
      delta.currentValue !== null &&
      delta.currentValue !== 0 &&
      (zeroBaselineMinimum === undefined || delta.currentValue >= zeroBaselineMinimum)
    ) {
      // Zero-baseline transition for a COUNT metric (e.g. results
      // going from 0 to 10): percent change is mathematically
      // undefined, but moving from "none" to "some" is itself a
      // real, factual state change. This branch is evaluated
      // INDEPENDENTLY of the standard sufficientEvidence gate,
      // because that gate (e.g. roasSufficient, requiring BOTH
      // periods to already clear a minimum) is structurally
      // impossible to satisfy when previousValue is genuinely 0 -
      // it would otherwise silently prevent this rule from ever
      // firing for the exact scenario it exists to handle. Instead,
      // a metric-specific zeroBaselineMinimum (when supplied) gives
      // this branch its own honest evidence bar - e.g. "0 -> 1"
      // conversion stays thin evidence and is not flagged, while
      // "0 -> 3+" is. Never an invented percentage or magnitude.
      // Restricted to COUNT-family metrics only; RATIO metrics are
      // not given this treatment since a "zero baseline ratio" does
      // not carry the same meaning.
      material = true
    }
  }

  return {
    metric,
    previousValue: delta.previousValue,
    currentValue: delta.currentValue,
    absoluteChange: delta.absoluteChange,
    percentChange: delta.percentChange,
    direction,
    material,
    sufficientEvidence,
  }
}

/**
 * Produces the deterministic overall monitor status from factual
 * observations. Never diagnoses a cause, never recommends an
 * action - "ATTENTION_REQUIRED" means "this deserves review by a
 * later layer", not "something is wrong".
 */
export function evaluateMonitor(
  current: AggregatedMetrics,
  previous: AggregatedMetrics,
  comparison: PeriodComparison,
  thresholds: SufficiencyThresholds = DEFAULT_SUFFICIENCY_THRESHOLDS
): MonitorResult {
  const hasAnyRealData = current.observationCount > 0 && previous.observationCount > 0
  if (!hasAnyRealData) {
    return { status: "INSUFFICIENT_DATA", changes: [] }
  }

  const ctrSufficient =
    (current.totalImpressions ?? 0) >= thresholds.minImpressionsForCtr &&
    (previous.totalImpressions ?? 0) >= thresholds.minImpressionsForCtr

  // Currency-safe spend sufficiency: fails closed unless both
  // periods genuinely share one detected currency - never compares
  // raw numbers across different, unconverted currencies.
  const currencyConsistent = current.currency !== null && current.currency === previous.currency
  const cpaSufficient =
    currencyConsistent &&
    (current.totalSpend ?? 0) >= thresholds.minSpendUnitsForCpa &&
    (previous.totalSpend ?? 0) >= thresholds.minSpendUnitsForCpa

  const roasSufficient =
    (current.totalResults ?? 0) >= thresholds.minConversionsForRoas &&
    (previous.totalResults ?? 0) >= thresholds.minConversionsForRoas

  const changes = [
    evaluateChange("spend", comparison.spend, cpaSufficient, thresholds.minSpendUnitsForCpa),
    evaluateChange("impressions", comparison.impressions, true),
    evaluateChange("clicks", comparison.clicks, ctrSufficient),
    evaluateChange("results", comparison.results, roasSufficient, thresholds.minConversionsForRoas),
    evaluateChange("ctr", comparison.ctr, ctrSufficient),
    evaluateChange("cpc", comparison.cpc, cpaSufficient),
    evaluateChange("cpm", comparison.cpm, cpaSufficient),
    evaluateChange("costPerResult", comparison.costPerResult, cpaSufficient && roasSufficient),
    evaluateChange("roas", comparison.roas, cpaSufficient && roasSufficient),
  ]

  const materialChanges = changes.filter((c) => c.material)
  let status: MonitorStatus
  if (materialChanges.length === 0) {
    status = "STABLE"
  } else if (materialChanges.length === 1) {
    status = "CHANGE_DETECTED"
  } else {
    status = "ATTENTION_REQUIRED"
  }

  return { status, changes }
}
