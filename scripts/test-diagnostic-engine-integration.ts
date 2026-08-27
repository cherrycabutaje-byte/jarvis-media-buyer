import { aggregateObservations, comparePeriods, evaluateMonitor, type RawObservationRow } from "@/lib/product/performanceAggregation"
import { evaluateEvidence, buildDiagnosticEvidencePacket, type EvidenceContext } from "@/lib/product/evidenceGate"
import { runDiagnosticEngine } from "@/lib/product/diagnosticEngine"
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
    workspaceId: "ws1", brandId: "brand1", metaAdAccountLinkId: "link1",
    entityType: "CAMPAIGN", entityId: "camp1",
    comparisonEntityType: "CAMPAIGN", comparisonEntityId: "camp1", comparisonWorkspaceId: "ws1",
    currentPeriod: { start: "2026-08-18", end: "2026-08-24" },
    comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" },
    currentObservationSyncedAt: new Date().toISOString(),
    isHistoricalAnalysis: false,
    ...overrides,
  }
}

function runFullChain(currentRows: RawObservationRow[], previousRows: RawObservationRow[], contextOverrides: Partial<EvidenceContext> = {}) {
  const current = aggregateObservations(currentRows)
  const previous = aggregateObservations(previousRows)
  const comparison = comparePeriods(current, previous)
  const monitor = evaluateMonitor(current, previous, comparison)
  const context = baseContext(contextOverrides)
  const gate = evaluateEvidence(context, current, previous, monitor)
  const packet = buildDiagnosticEvidencePacket(context, gate, monitor)
  const diagnosis = runDiagnosticEngine(packet)
  return { monitor, gate, packet, diagnosis }
}

console.log("=== DE-INTEGRATION 1: Fully sufficient example - real MonitorResult -> Evidence Gate -> Packet -> Diagnostic Engine ===")
{
  const { monitor, gate, packet, diagnosis } = runFullChain(
    [row({ spend: 50, impressions: 5000, clicks: 100, results: 10, purchaseConversionValue: 400 })],
    [row({ spend: 100, impressions: 5000, clicks: 100, results: 10, purchaseConversionValue: 200 })]
  )
  assert(monitor.changes.length > 0, "real Performance Monitor produced observed changes")
  assert(gate.overallStatus === "SUFFICIENT", `Evidence Gate reports SUFFICIENT once every metric family (including ROAS) has real components on both sides (got ${gate.overallStatus})`)
  assert(packet !== null, "a real Diagnostic Evidence Packet was built")
  assert(diagnosis.hypotheses.length > 0, "Diagnostic Engine produced hypotheses from the real packet end-to-end")
}

console.log("\n=== DE-INTEGRATION 2: Partially sufficient example - only sufficient signals reach diagnosis ===")
{
  const { gate, diagnosis } = runFullChain(
    [row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })],
    [row({ spend: 100, impressions: 5000, clicks: 100, results: 1 })]
  )
  assert(gate.overallStatus === "PARTIALLY_SUFFICIENT", "Evidence Gate correctly reports PARTIALLY_SUFFICIENT")
  const revenueHyp = diagnosis.hypotheses.find((h) => h.code === "REVENUE_EFFICIENCY_WEAKENED")
  assert(revenueHyp?.status === "INSUFFICIENT_EVIDENCE", "the insufficient roas signal never reaches the Diagnostic Engine as usable evidence")
}

console.log("\n=== DE-INTEGRATION 3: Insufficient example - no evidence passes, no diagnosis possible ===")
{
  const { gate, diagnosis } = runFullChain(
    [row({ spend: 0.5, results: 1 })],
    [row({ spend: 0.5, results: 1 })]
  )
  assert(gate.overallStatus === "INSUFFICIENT", "Evidence Gate correctly reports INSUFFICIENT")
  assert(diagnosis.overallState === "NO_DIAGNOSIS", `no sufficient evidence -> Diagnostic Engine reports NO_DIAGNOSIS (got ${diagnosis.overallState})`)
}
console.log("\n=== DE-INTEGRATION 4: No-data example - empty observations produce no diagnosis ===")
{
  const { gate, diagnosis } = runFullChain([], [row({ spend: 100 })])
  assert(gate.overallStatus === "NOT_APPLICABLE", "Evidence Gate reports NOT_APPLICABLE for empty current observations")
  assert(diagnosis.overallState === "NO_DIAGNOSIS", "Diagnostic Engine correctly reports NO_DIAGNOSIS")
}

console.log("\n=== DE-INTEGRATION 5: Entity-grain preservation through the full real chain ===")
{
  const { diagnosis } = runFullChain(
    [row({ spend: 50, impressions: 5000, clicks: 100 })],
    [row({ spend: 100, impressions: 5000, clicks: 100 })],
    { entityType: "AD_SET", entityId: "adset_specific_99", comparisonEntityType: "AD_SET", comparisonEntityId: "adset_specific_99" }
  )
  assert(diagnosis.entityType === "AD_SET" && diagnosis.entityId === "adset_specific_99", "the final DiagnosticResult preserves the exact entity through Monitor -> Gate -> Packet -> Diagnostic Engine")
}

console.log("\n=== DE-INTEGRATION 6: Root-cause-unresolved behavior through the real chain ===")
{
  // A genuine click-response-weakened scenario (clicks drop
  // relative to flat impressions/spend) so at least one mechanism
  // is actually identified - only then does the unresolved-root-
  // cause note get attached.
  const { diagnosis } = runFullChain(
    [row({ spend: 100, impressions: 5000, clicks: 50 })],
    [row({ spend: 100, impressions: 5000, clicks: 100 })]
  )
  const rootCauseHyps = diagnosis.hypotheses.filter((h) => h.category === "ROOT_CAUSE")
  assert(rootCauseHyps.length > 0 && rootCauseHyps.every((h) => h.status === "INSUFFICIENT_EVIDENCE"), "root-cause hypotheses remain unresolved through the entire real pipeline")
  assert(diagnosis.overallState !== "NO_DIAGNOSIS", `a mechanism was genuinely identified in this scenario (got ${diagnosis.overallState})`)
  assert(diagnosis.unresolvedQuestions.length > 0, "an explicit unresolved-question note is present once a mechanism is identified")
}

console.log("\n=== DE-INTEGRATION 7: Server Action returns diagnostic state fields (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/performanceSummaryActions.ts"), "utf-8")
  assert(actionSource.includes("diagnosticState") && actionSource.includes("diagnosticHypotheses") && actionSource.includes("diagnosticNote"), "PerformanceSummaryResult genuinely carries diagnostic state fields")
  assert(actionSource.includes("runDiagnosticEngine(diagnosticPacket)"), "the action genuinely calls runDiagnosticEngine with the real built packet, not a bypass")
}

console.log("\n=== DE-INTEGRATION 8: Diagnostic Engine cannot consume arbitrary MonitorResult in the wired action (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/performanceSummaryActions.ts"), "utf-8")
  assert(!/runDiagnosticEngine\(\s*monitor\s*\)/.test(actionSource), "runDiagnosticEngine is never called directly with the raw MonitorResult")
}

console.log("\n=== DE-INTEGRATION 9: No AI/Meta call path exists in the wired diagnostic flow (structural proof) ===")
{
  const engineSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/diagnosticEngine.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "anthropic", "openai", "graph.facebook.com"]
  const found = forbidden.filter((w) => engineSource.includes(w))
  assert(found.length === 0, `zero AI/Meta call primitives in the wired diagnostic engine (found: ${found.join(", ") || "none"})`)
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }