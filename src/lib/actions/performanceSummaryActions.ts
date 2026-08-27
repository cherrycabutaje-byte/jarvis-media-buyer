"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getMetaAdAccountLinkForBrand } from "@/lib/repositories/metaAdAccountRepository"
import { getObservationsInRange, filterRowsByEntity } from "@/lib/repositories/metaAdObservationRepository"
import { aggregateObservations, comparePeriods, evaluateMonitor, type AggregatedMetrics, type PeriodComparison, type RawObservationRow, type MonitorResult } from "@/lib/product/performanceAggregation"
import { evaluateEvidence, buildDiagnosticEvidencePacket, type EvidenceContext, type SignalEvidenceResult, type OverallGateStatus } from "@/lib/product/evidenceGate"

/**
 * Production flow (Performance Monitor V1 + Evidence Gate V1):
 *
 *   Meta observations (already-synced rows)
 *         v
 *   aggregateObservations() -> AggregatedMetrics (current, previous)
 *         v
 *   comparePeriods() + evaluateMonitor() -> MonitorResult (Performance Monitor)
 *         v
 *   evaluateEvidence() -> EvidenceGateResult (Evidence Gate - consumes the
 *   real typed MonitorResult directly, never re-derives materiality)
 *         v
 *   buildDiagnosticEvidencePacket() -> DiagnosticEvidencePacket | null
 *   (built here to prove the full pipeline runs end-to-end on real
 *   data, but INTENTIONALLY NOT returned to the client - it exists
 *   solely as the typed hand-off boundary for a FUTURE Diagnostic
 *   Engine, which does not exist yet and is not built in this slice)
 *
 * Only customer-safe, non-technical fields cross into
 * PerformanceSummaryResult - raw internal EvidenceReasonCode values
 * never reach the client.
 */

export interface CustomerFacingSignalEvidence {
  metric: string
  status: "SUFFICIENT" | "INSUFFICIENT" | "NOT_APPLICABLE"
  customerExplanation: string
}

export interface PerformanceSummaryResult {
  success: boolean
  error: string | null
  currentPeriod: { start: string; end: string } | null
  previousPeriod: { start: string; end: string } | null
  current: AggregatedMetrics | null
  previous: AggregatedMetrics | null
  comparison: PeriodComparison | null
  monitor: MonitorResult | null
  evidenceStatus: OverallGateStatus | null
  evidenceLabel: string | null
  evidenceSignals: CustomerFacingSignalEvidence[] | null
}

function toRawRow(row: Record<string, unknown>): RawObservationRow {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v))
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    linkClicks: num(row.link_clicks),
    results: num(row.results),
    purchaseConversionValue: num(row.purchase_conversion_value),
    currency: typeof row.currency === "string" ? row.currency : null,
  }
}

/**
 * Extracts the real observation sync timestamp (never the client
 * clock, never page-load time, never the reporting period's own
 * end date) from the actual rows returned for the current period.
 * Uses the OLDEST (minimum) last_synced_at among the current
 * period's rows - the most conservative signal, since if any
 * relevant observation is stale, the whole comparison should be
 * treated as potentially stale. Returns null (fails closed for
 * freshness) when no rows or no valid timestamp exists - never
 * silently substitutes an arbitrary fallback.
 */
function extractOldestSyncTimestamp(rows: Array<Record<string, unknown>>): string | null {
  const timestamps = rows
    .map((r) => (typeof r.last_synced_at === "string" ? Date.parse(r.last_synced_at) : NaN))
    .filter((t) => !Number.isNaN(t))
  if (timestamps.length === 0) return null
  return new Date(Math.min(...timestamps)).toISOString()
}

const CUSTOMER_METRIC_NAMES: Record<string, string> = {
  spend: "Spend", impressions: "Impressions", clicks: "Clicks", results: "Results",
  ctr: "CTR", cpc: "CPC", cpm: "CPM", costPerResult: "Cost per result", roas: "ROAS",
}

/**
 * Maps internal EvidenceReasonCode values to plain, non-technical
 * customer sentences. Raw reason codes are deliberately never
 * surfaced as the primary explanation - they remain internal only.
 */
function customerExplanationFor(signal: SignalEvidenceResult): string {
  if (signal.status === "SUFFICIENT") return "Enough evidence for analysis."
  if (signal.status === "NOT_APPLICABLE") return "Not applicable for this metric."

  if (signal.reasons.includes("STALE_OBSERVATION")) return "This data needs to be refreshed before JARVIS can analyze this change."
  if (signal.reasons.includes("CURRENCY_MISMATCH")) return "This comparison spans different currencies and cannot be analyzed yet."
  if (signal.reasons.includes("INSUFFICIENT_IMPRESSIONS")) return "More reach is needed before JARVIS can analyze this change."
  if (signal.reasons.includes("INSUFFICIENT_CLICKS")) return "More click activity is needed before JARVIS can analyze this change."
  if (signal.reasons.includes("INSUFFICIENT_SPEND")) return "More spend history is needed before JARVIS can analyze this change."
  if (signal.reasons.includes("INSUFFICIENT_RESULTS")) return "More conversion data is needed before JARVIS can analyze this change."
  if (signal.reasons.includes("MISSING_CURRENT_DATA") || signal.reasons.includes("MISSING_COMPARISON_DATA")) {
    return "Some data is missing for this comparison."
  }  if (signal.reasons.includes("INSUFFICIENT_RESULTS")) return "More conversion data is needed before JARVIS can analyze this change."
  if (signal.reasons.includes("MISSING_CURRENT_DATA") || signal.reasons.includes("MISSING_COMPARISON_DATA")) {
    return "Some data is missing for this comparison."
  }
  if (signal.reasons.some((r) => r === "ENTITY_MISMATCH" || r === "ENTITY_TYPE_MISMATCH" || r === "WORKSPACE_MISMATCH" || r === "PERIOD_OVERLAP" || r === "PERIOD_REVERSED" || r === "MALFORMED_INPUT")) {
    return "This comparison could not be validated."
  }
  return "Not enough evidence yet to analyze this change."
}

const EVIDENCE_STATUS_LABEL: Record<OverallGateStatus, string> = {
  SUFFICIENT: "READY FOR ANALYSIS",
  PARTIALLY_SUFFICIENT: "PARTIALLY READY",
  INSUFFICIENT: "MORE DATA NEEDED",
  NOT_APPLICABLE: "NOT ENOUGH DATA YET",
}

/**
 * ENTITY-GRAIN CONTRACT (mandatory): every call represents exactly
 * ONE explicit entity type and ID - never a mixed/derived aggregate
 * across account/campaign/ad-set/ad grains, since those grains
 * genuinely overlap in Meta`s data model (a campaign`s spend and its
 * own ad sets` spend both exist as separate rows) and summing across
 * them would double/triple-count every metric. When `entity` is
 * omitted, this defaults to genuine ACCOUNT-grain monitoring using
 * the real external Meta ad account ID (never derived by summing
 * campaign/ad-set/ad rows) - the same identity the sync orchestrator
 * itself uses when storing ACCOUNT-level observations. The typed
 * `entity` parameter also establishes the path for future campaign/
 * ad-set/ad monitoring without requiring a new UI in this slice.
 */
export async function getPerformanceSummaryAction(
  brandId: string,
  currentPeriod: { start: string; end: string },
  previousPeriod: { start: string; end: string },
  entity?: { entityType: string; entityId: string }
): Promise<PerformanceSummaryResult> {
  const fail = (error: string): PerformanceSummaryResult => ({
    success: false, error, currentPeriod: null, previousPeriod: null, current: null, previous: null,
    comparison: null, monitor: null, evidenceStatus: null, evidenceLabel: null, evidenceSignals: null,
  })

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return fail("You must be logged in.")
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return fail(brandResult.error ?? "Business not found.")
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return fail("You are not authorized to view performance data for this business.")
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return fail("No Meta ad account is connected for this business.")
  }

  const targetEntityType = entity?.entityType ?? "ACCOUNT"
  const targetEntityId = entity?.entityId ?? linkResult.data.meta_ad_account_id

  const currentRowsResult = await getObservationsInRange(linkResult.data.id, targetEntityType, targetEntityId, currentPeriod.start, currentPeriod.end)
  const previousRowsResult = await getObservationsInRange(linkResult.data.id, targetEntityType, targetEntityId, previousPeriod.start, previousPeriod.end)

  if (currentRowsResult.error || previousRowsResult.error) {
    return fail(currentRowsResult.error ?? previousRowsResult.error ?? "Could not read performance data.")
  }

  // Defensive second filter (defense in depth) - re-asserts the
  // same entity-grain boundary already enforced by the SQL query.
  const currentRows = filterRowsByEntity(currentRowsResult.data ?? [], targetEntityType, targetEntityId)
  const previousRows = filterRowsByEntity(previousRowsResult.data ?? [], targetEntityType, targetEntityId)

  const currentAggregated = aggregateObservations(currentRows.map(toRawRow))
  const previousAggregated = aggregateObservations(previousRows.map(toRawRow))
  const comparison = comparePeriods(currentAggregated, previousAggregated)
  const monitor = evaluateMonitor(currentAggregated, previousAggregated, comparison)

  // Evidence Gate consumes the real typed MonitorResult directly -
  // no materiality/threshold logic is re-derived here.
  const evidenceContext: EvidenceContext = {
    workspaceId: brandResult.data.workspace_id,
    brandId,
    metaAdAccountLinkId: linkResult.data.id,
    entityType: targetEntityType,
    entityId: targetEntityId,
    comparisonEntityType: targetEntityType,
    comparisonEntityId: targetEntityId,
    comparisonWorkspaceId: brandResult.data.workspace_id,
    currentPeriod,
    comparisonPeriod: previousPeriod,
    currentObservationSyncedAt: extractOldestSyncTimestamp(currentRows),
    isHistoricalAnalysis: false,
  }
  const evidenceGateResult = evaluateEvidence(evidenceContext, currentAggregated, previousAggregated, monitor)

  // Built to prove the full pipeline runs end-to-end on real data -
  // deliberately NOT included in the returned client-facing result.
  // This is the typed hand-off boundary for a FUTURE Diagnostic
  // Engine only; no such engine exists or is called here.
  const _diagnosticPacket = buildDiagnosticEvidencePacket(evidenceContext, evidenceGateResult, monitor)
  void _diagnosticPacket

  const evidenceSignals: CustomerFacingSignalEvidence[] = evidenceGateResult.signals.map((s) => ({
    metric: CUSTOMER_METRIC_NAMES[s.metric] ?? s.metric,
    status: s.status,
    customerExplanation: customerExplanationFor(s),
  }))

  return {
    success: true,
    error: null,
    currentPeriod,
    previousPeriod,
    current: currentAggregated,
    previous: previousAggregated,
    comparison,
    monitor,
    evidenceStatus: evidenceGateResult.overallStatus,
    evidenceLabel: EVIDENCE_STATUS_LABEL[evidenceGateResult.overallStatus],
    evidenceSignals,
  }
}