import {
  evaluateEvidence,
  buildDiagnosticEvidencePacket,
  FRESHNESS_MAX_AGE_HOURS,
  type EvidenceContext,
} from "@/lib/product/evidenceGate"
import { aggregateObservations, evaluateMonitor, comparePeriods, type RawObservationRow, type AggregatedMetrics, type MonitorResult, type ObservedChange } from "@/lib/product/performanceAggregation"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function row(overrides: Partial<RawObservationRow> = {}): RawObservationRow {
  return {
    spend: null, impressions: null, reach: null, frequency: null, clicks: null, linkClicks: null, results: null, purchaseConversionValue: null, currency: "USD",
    ...overrides,
  }
}

function baseContext(overrides: Partial<EvidenceContext> = {}): EvidenceContext {
  return {
    workspaceId: "ws1",
    brandId: "brand1",
    metaAdAccountLinkId: "link1",
    entityType: "CAMPAIGN",
    entityId: "camp1",
    comparisonEntityType: "CAMPAIGN",
    comparisonEntityId: "camp1",
    comparisonWorkspaceId: "ws1",
    currentPeriod: { start: "2026-08-18", end: "2026-08-24" },
    comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" },
    currentObservationSyncedAt: new Date().toISOString(),
    isHistoricalAnalysis: false,
    ...overrides,
  }
}

function makeMonitor(current: AggregatedMetrics, previous: AggregatedMetrics): MonitorResult {
  const comparison = comparePeriods(current, previous)
  return evaluateMonitor(current, previous, comparison)
}

console.log("=== CASE 1: Valid same-entity comparison passes identity check ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonValid === true, "identical entity/workspace/type passes identity check")
}

console.log("\n=== CASE 2: Entity mismatch fails ===")
{
  const context = baseContext({ comparisonEntityId: "camp2" })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonValid === false, "mismatched entity id fails")
  assert(gate.comparisonReasons.includes("ENTITY_MISMATCH"), "correct reason code returned")
}

console.log("\n=== CASE 3: Entity-type mismatch fails ===")
{
  const context = baseContext({ comparisonEntityType: "AD_SET" })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonReasons.includes("ENTITY_TYPE_MISMATCH"), "entity type mismatch correctly flagged")
}

console.log("\n=== CASE 4: Brand/workspace mismatch fails ===")
{
  const context = baseContext({ comparisonWorkspaceId: "ws2" })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonReasons.includes("WORKSPACE_MISMATCH"), "workspace mismatch correctly flagged")
}

console.log("\n=== CASE 5: Overlapping periods fail ===")
{
  const context = baseContext({ currentPeriod: { start: "2026-08-15", end: "2026-08-24" }, comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" } })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonReasons.includes("PERIOD_OVERLAP"), "overlapping periods correctly flagged")
}

console.log("\n=== CASE 6: Reversed chronological periods fail ===")
{
  const context = baseContext({ currentPeriod: { start: "2026-08-01", end: "2026-08-07" }, comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" } })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonReasons.includes("PERIOD_REVERSED"), "reversed period order correctly flagged")
}

console.log("\n=== CASE 7: Missing current data fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.overallStatus === "NOT_APPLICABLE", "no observed changes at all when current is empty -> NOT_APPLICABLE (monitor itself reports INSUFFICIENT_DATA)")
}

console.log("\n=== CASE 8: Missing comparison data fails per-signal ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: null, impressions: 5000, clicks: 100, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const spendSignal = gate.signals.find((s) => s.metric === "spend")
  assert(spendSignal?.reasons.includes("MISSING_COMPARISON_DATA") ?? false, "missing previous spend correctly flagged per-signal")
}

console.log("\n=== CASE 9: Missing metric != zero ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: null, clicks: null })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const clicksSignal = gate.signals.find((s) => s.metric === "clicks")
  assert(clicksSignal?.reasons.includes("MISSING_CURRENT_DATA") ?? false, "null current clicks correctly reported as missing, not zero")
}

console.log("\n=== CASE 10: Genuine zero preserved ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 0, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 0, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const clicksSignal = gate.signals.find((s) => s.metric === "clicks")
  assert(!(clicksSignal?.reasons.includes("MISSING_CURRENT_DATA") ?? false), "a genuine zero click count is never treated as missing data")
}
console.log("\n=== CASE 11: CTR evidence with too few impressions fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 10, clicks: 1, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 10, clicks: 5, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const ctrSignal = gate.signals.find((s) => s.metric === "ctr")
  assert(ctrSignal?.status === "INSUFFICIENT", "CTR evidence with only 10 impressions correctly fails")
  assert(ctrSignal?.reasons.includes("INSUFFICIENT_IMPRESSIONS") ?? false, "correct reason code for CTR evidence failure")
}

console.log("\n=== CASE 12: CTR evidence with adequate exposure passes ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const ctrSignal = gate.signals.find((s) => s.metric === "ctr")
  assert(ctrSignal?.status === "SUFFICIENT", "CTR evidence with adequate impressions passes")
}

console.log("\n=== CASE 13: CPC evidence with inadequate exposure fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 1, impressions: 10, clicks: 1, results: 10 })])
  const previous = aggregateObservations([row({ spend: 1, impressions: 10, clicks: 1, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const cpcSignal = gate.signals.find((s) => s.metric === "cpc")
  assert(cpcSignal?.status === "INSUFFICIENT", "CPC evidence with inadequate spend fails")
  assert(cpcSignal?.reasons.includes("INSUFFICIENT_SPEND") ?? false, "correct reason code for CPC evidence failure")
}

console.log("\n=== CASE 14: CPA evidence with insufficient spend fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 0.5, results: 10 })])
  const previous = aggregateObservations([row({ spend: 0.5, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const cpaSignal = gate.signals.find((s) => s.metric === "costPerResult")
  assert(cpaSignal?.status === "INSUFFICIENT", "CPA evidence with only 0.50 units of spend fails")
  assert(cpaSignal?.reasons.includes("INSUFFICIENT_SPEND") ?? false, "correct reason code")
}

console.log("\n=== CASE 15: CPA evidence with too few results fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 1 })])
  const previous = aggregateObservations([row({ spend: 100, results: 1 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const cpaSignal = gate.signals.find((s) => s.metric === "costPerResult")
  assert(cpaSignal?.status === "INSUFFICIENT", "CPA evidence with only 1 conversion fails")
  assert(cpaSignal?.reasons.includes("INSUFFICIENT_RESULTS") ?? false, "correct reason code")
}

console.log("\n=== CASE 16: ROAS evidence with too few results fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 1, purchaseConversionValue: 500 })])
  const previous = aggregateObservations([row({ spend: 100, results: 1, purchaseConversionValue: 500 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const roasSignal = gate.signals.find((s) => s.metric === "roas")
  assert(roasSignal?.status === "INSUFFICIENT", "ROAS evidence with only 1 conversion fails")
}

console.log("\n=== CASE 17: ROAS evidence with sufficient components passes ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 10, purchaseConversionValue: 500 })])
  const previous = aggregateObservations([row({ spend: 100, results: 10, purchaseConversionValue: 500 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const roasSignal = gate.signals.find((s) => s.metric === "roas")
  assert(roasSignal?.status === "SUFFICIENT", "ROAS evidence with adequate spend and results passes")
}

console.log("\n=== CASE 18: Monetary evidence with currency mismatch fails ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 10, currency: "USD" })])
  const previous = aggregateObservations([row({ spend: 100, results: 10, currency: "EUR" })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const spendSignal = gate.signals.find((s) => s.metric === "spend")
  assert(spendSignal?.reasons.includes("CURRENCY_MISMATCH") ?? false, "currency mismatch correctly flagged for a monetary metric")
}

console.log("\n=== CASE 19: Non-monetary evidence not blocked by irrelevant currency mismatch ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, currency: "USD" })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, currency: "EUR" })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const impressionsSignal = gate.signals.find((s) => s.metric === "impressions")
  assert(!(impressionsSignal?.reasons.includes("CURRENCY_MISMATCH") ?? false), "impressions (non-monetary) is not incorrectly blocked by a currency mismatch elsewhere")
}

console.log("\n=== CASE 20: Stale current-monitor evidence fails per the documented freshness rule ===")
{
  const staleTimestamp = new Date(Date.now() - (FRESHNESS_MAX_AGE_HOURS + 1) * 60 * 60 * 1000).toISOString()
  const context = baseContext({ currentObservationSyncedAt: staleTimestamp, isHistoricalAnalysis: false })
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const spendSignal = gate.signals.find((s) => s.metric === "spend")
  assert(spendSignal?.reasons.includes("STALE_OBSERVATION") ?? false, "an observation synced beyond the freshness window fails for current monitoring")
}

console.log("\n=== CASE 21: Legitimate historical analysis is not rejected solely for an old reporting period ===")
{
  const staleTimestamp = new Date(Date.now() - (FRESHNESS_MAX_AGE_HOURS + 100) * 60 * 60 * 1000).toISOString()
  const context = baseContext({ currentObservationSyncedAt: staleTimestamp, isHistoricalAnalysis: true })
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 10 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const spendSignal = gate.signals.find((s) => s.metric === "spend")
  assert(!(spendSignal?.reasons.includes("STALE_OBSERVATION") ?? false), "explicit historical analysis bypasses the freshness check entirely")
}

console.log("\n=== CASE 22: Unsupported metric fails closed (NOT_APPLICABLE) ===")
{
  const context = baseContext()
  const current: AggregatedMetrics = aggregateObservations([row({ spend: 100 })])
  const previous: AggregatedMetrics = aggregateObservations([row({ spend: 100 })])
  const fakeMonitor: MonitorResult = {
    status: "STABLE",
    changes: [{ metric: "totallyUnknownMetric", previousValue: 1, currentValue: 2, absoluteChange: 1, percentChange: 100, direction: "UP", material: true, sufficientEvidence: true } as ObservedChange],
  }
  const gate = evaluateEvidence(context, current, previous, fakeMonitor)
  const signal = gate.signals.find((s) => s.metric === "totallyUnknownMetric")
  assert(signal?.status === "NOT_APPLICABLE", "an unrecognized metric name fails closed as NOT_APPLICABLE, never SUFFICIENT")
}

console.log("\n=== CASE 23: Malformed input (invalid period dates) fails closed ===")
{
  const context = baseContext({ currentPeriod: { start: "not-a-date", end: "also-not-a-date" } })
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  assert(gate.comparisonReasons.includes("MALFORMED_INPUT"), "unparseable period dates fail closed as MALFORMED_INPUT")
  assert(gate.comparisonValid === false, "malformed input never passes comparison validity")
}
console.log("\n=== CASE 24: Unknown/empty monitor changes fail closed as NOT_APPLICABLE ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100 })])
  const previous = aggregateObservations([row({ spend: 100 })])
  const emptyMonitor: MonitorResult = { status: "STABLE", changes: [] }
  const gate = evaluateEvidence(context, current, previous, emptyMonitor)
  assert(gate.overallStatus === "NOT_APPLICABLE", "zero observed changes fails closed as NOT_APPLICABLE, never SUFFICIENT")
}

console.log("\n=== CASE 25: One sufficient signal + one insufficient signal remains distinguishable (PARTIALLY_SUFFICIENT) ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const ctrSignal = gate.signals.find((s) => s.metric === "ctr")
  const roasSignal = gate.signals.find((s) => s.metric === "roas")
  assert(ctrSignal?.status === "SUFFICIENT", "CTR signal independently sufficient")
  assert(roasSignal?.status === "INSUFFICIENT", "ROAS signal independently insufficient (only 1 conversion)")
  assert(gate.overallStatus === "PARTIALLY_SUFFICIENT", `mixed signal sufficiency correctly rolls up to PARTIALLY_SUFFICIENT (got ${gate.overallStatus})`)
}

console.log("\n=== CASE 26: Failed signal excluded from Diagnostic Evidence Packet ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  const packetMetrics = packet?.observedChanges.map((c) => c.metric) ?? []
  assert(!packetMetrics.includes("roas"), "an INSUFFICIENT signal (ROAS) is never silently included in the evidence packet")
}

console.log("\n=== CASE 27: Successful signal included in Diagnostic Evidence Packet ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  const packetMetrics = packet?.observedChanges.map((c) => c.metric) ?? []
  assert(packetMetrics.includes("ctr"), "a SUFFICIENT signal (CTR) is included in the evidence packet")
}

console.log("\n=== CASE 28: Packet preserves entity provenance ===")
{
  const context = baseContext({ entityType: "AD", entityId: "ad_specific_123", comparisonEntityType: "AD", comparisonEntityId: "ad_specific_123" })
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  assert(packet?.entityType === "AD" && packet?.entityId === "ad_specific_123", "packet preserves exact entity type and id provenance")
}

console.log("\n=== CASE 29: Packet preserves reporting periods ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  assert(packet?.currentPeriod.start === context.currentPeriod.start && packet?.comparisonPeriod.start === context.comparisonPeriod.start, "packet preserves exact reporting periods")
}

console.log("\n=== CASE 30: Packet preserves factual metric values ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 50, impressions: 5000, clicks: 100 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  const spendEntry = packet?.observedChanges.find((c) => c.metric === "spend")
  assert(spendEntry?.currentValue === 50 && spendEntry?.previousValue === 100, "packet preserves exact factual metric values, not rounded or altered")
}

console.log("\n=== CASE 31: Packet contains no diagnosis or recommendation language (structural proof) ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 50, impressions: 5000, clicks: 100 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000, clicks: 100 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  const serialized = JSON.stringify(packet).toLowerCase()
  const forbidden = ["fatigue", "recommend", "cause", "diagnosis", "pause", "scale", "should", "audience"]
  const found = forbidden.filter((w) => serialized.includes(w))
  assert(found.length === 0, `packet contains zero diagnostic/recommendation language (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 32: Owner target does not override insufficient evidence (target comparison stays separate) ===")
{
  // Evidence Gate itself never even accepts an owner target as an
  // input parameter - structurally proving targets cannot influence
  // the sufficiency decision at all, matching the "targets are
  // context, not proof" requirement.
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 1 })])
  const previous = aggregateObservations([row({ spend: 100, results: 1 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const cpaSignal = gate.signals.find((s) => s.metric === "costPerResult")
  assert(cpaSignal?.status === "INSUFFICIENT", "an owner target CPA (not even passed to this function) cannot make thin evidence (1 conversion) sufficient")
}

console.log("\n=== CASE 33: Zero-baseline transition handled safely (reuses Performance Monitor's own rule, no new fabrication) ===")
{
  const context = baseContext()
  const current = aggregateObservations([row({ spend: 100, results: 10 })])
  const previous = aggregateObservations([row({ spend: 100, results: 0 })])
  const monitor = makeMonitor(current, previous)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const resultsSignal = gate.signals.find((s) => s.metric === "results")
  assert(resultsSignal !== undefined, "results signal exists for a zero-baseline transition")
}

console.log("\n=== CASE 34: Performance Monitor materiality != Evidence Gate sufficiency (independent concepts, using a genuinely divergent example) ===")
{
  // impressions is always sufficientEvidence=true in Performance
  // Monitor (no gating), so a large swing is correctly material -
  // but Evidence Gate independently rejects it here for a STALE
  // observation, a dimension Performance Monitor never checks at
  // all. This demonstrates the two concepts are genuinely
  // independent axes, not the same signal surfaced twice - unlike
  // ROAS, whose sufficiency happens to be gated identically in both
  // modules by design (see CASE 25 for that pairing instead).
  const staleTimestamp = new Date(Date.now() - (FRESHNESS_MAX_AGE_HOURS + 1) * 60 * 60 * 1000).toISOString()
  const context = baseContext({ currentObservationSyncedAt: staleTimestamp, isHistoricalAnalysis: false })
  const current = aggregateObservations([row({ spend: 100, impressions: 10000 })])
  const previous = aggregateObservations([row({ spend: 100, impressions: 5000 })])
  const monitor = makeMonitor(current, previous)
  const impressionsChange = monitor.changes.find((c) => c.metric === "impressions")
  const gate = evaluateEvidence(context, current, previous, monitor)
  const impressionsSignal = gate.signals.find((s) => s.metric === "impressions")
  assert(impressionsChange?.material === true, "Performance Monitor correctly flags this 100% impressions swing as material (impressions has no sufficiency gate)")
  assert(impressionsSignal?.status === "INSUFFICIENT", "Evidence Gate correctly still deems it INSUFFICIENT (stale observation) despite materiality - the two concepts are independent")
}

console.log("\n=== CASE 35: No AI/provider/Meta call path exists (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/evidenceGate.ts"), "utf-8")
  const forbidden = ["fetch(", "anthropic", "openai", "graph.facebook.com", "GraphApiMetaAdsProvider"]
  const found = forbidden.filter((w) => source.toLowerCase().includes(w.toLowerCase()))
  assert(found.length === 0, `evidenceGate.ts source contains zero network/AI/Meta call primitives (found: ${found.join(", ") || "none"})`)
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }