import { runDiagnosticEngine } from "@/lib/product/diagnosticEngine"
import type { DiagnosticEvidencePacket } from "@/lib/product/evidenceGate"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

type ChangeEntry = DiagnosticEvidencePacket["observedChanges"][number]
function change(metric: string, direction: "UP" | "DOWN" | "UNCHANGED" | null, material: boolean, percentChange: number | null = 10): ChangeEntry {
  return { metric, previousValue: 1, currentValue: 2, absoluteChange: 1, percentChange, direction, material }
}

function packet(changes: ChangeEntry[], overrides: Partial<DiagnosticEvidencePacket> = {}): DiagnosticEvidencePacket {
  return {
    workspaceId: "ws1", brandId: "brand1", entityType: "CAMPAIGN", entityId: "camp1",
    currentPeriod: { start: "2026-08-18", end: "2026-08-24" },
    comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" },
    observedChanges: changes,
    evidenceStatus: "SUFFICIENT",
    ...overrides,
  }
}

function findHyp(result: ReturnType<typeof runDiagnosticEngine>, code: string) {
  return result.hypotheses.find((h) => h.code === code)
}

console.log("=== CASE 1: No Evidence Packet -> no diagnosis ===")
{
  const result = runDiagnosticEngine(null)
  assert(result.overallState === "NO_DIAGNOSIS", "null packet -> NO_DIAGNOSIS")
  assert(result.hypotheses.length === 0, "no hypotheses evaluated at all")
}

console.log("\n=== CASE 2: Empty packet (zero observedChanges) -> no diagnosis ===")
{
  const result = runDiagnosticEngine(packet([]))
  assert(result.overallState === "NO_DIAGNOSIS", "empty observedChanges -> NO_DIAGNOSIS")
}

console.log("\n=== CASE 3: Entity provenance preserved exactly ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true)], { entityType: "AD", entityId: "ad_42" }))
  assert(result.entityType === "AD" && result.entityId === "ad_42", "diagnostic result preserves exact entity provenance")
}

console.log("\n=== CASE 4: Click-response weakening supported by appropriate CTR/CPC relationship ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "SUPPORTED", `CTR down + CPC up, both material -> SUPPORTED (got ${hyp?.status})`)
  assert(hyp?.confidence === "HIGH", "both required metrics material -> HIGH confidence")
}

console.log("\n=== CASE 5: Stable click response does not trigger that mechanism ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "UNCHANGED", false), change("cpc", "UNCHANGED", false)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "NOT_APPLICABLE", `unchanged CTR/CPC does not falsely trigger the mechanism (got ${hyp?.status})`)
}

console.log("\n=== CASE 6: Delivery-cost increase supported by appropriate CPM relationship ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true)]))
  const hyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(hyp?.status === "SUPPORTED", `material CPM increase -> SUPPORTED (got ${hyp?.status})`)
}

console.log("\n=== CASE 7: Cost-per-result increase requires the costPerResult component (renamed from an overclaimed post-click-conversion label - see closure audit) ===")
{
  const resultMissing = runDiagnosticEngine(packet([change("ctr", "DOWN", true)]))
  const hypMissing = findHyp(resultMissing, "COST_PER_RESULT_INCREASED")
  assert(hypMissing?.status === "INSUFFICIENT_EVIDENCE", "missing costPerResult -> INSUFFICIENT_EVIDENCE")

  const resultPresent = runDiagnosticEngine(packet([change("costPerResult", "UP", true)]))
  const hypPresent = findHyp(resultPresent, "COST_PER_RESULT_INCREASED")
  assert(hypPresent?.status === "SUPPORTED", "adequate costPerResult component present and material -> SUPPORTED")
  assert((hypPresent?.missingEvidence.length ?? 0) > 0, "even when SUPPORTED, the mechanism explicitly notes it makes no post-click-specific attribution")
}

console.log("\n=== CASE 8: Revenue-efficiency weakening requires adequate components ===")
{
  const resultMissing = runDiagnosticEngine(packet([change("spend", "UP", true)]))
  const hypMissing = findHyp(resultMissing, "REVENUE_EFFICIENCY_WEAKENED")
  assert(hypMissing?.status === "INSUFFICIENT_EVIDENCE", "missing roas -> INSUFFICIENT_EVIDENCE")

  const resultPresent = runDiagnosticEngine(packet([change("roas", "DOWN", true)]))
  const hypPresent = findHyp(resultPresent, "REVENUE_EFFICIENCY_WEAKENED")
  assert(hypPresent?.status === "SUPPORTED", "adequate roas component present and material -> SUPPORTED")
}

console.log("\n=== CASE 9: Missing required evidence produces INSUFFICIENT_EVIDENCE with explicit missing list ===")
{
  // CLICK_RESPONSE_WEAKENED requires only ctr - cpc is deliberately
  // NOT a required signal (closure audit: cpc is mathematically
  // derived from ctr/cpm, not independent corroboration), so exactly
  // one missing-evidence entry is expected here, not two.
  const result = runDiagnosticEngine(packet([change("spend", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "INSUFFICIENT_EVIDENCE", "missing ctr entirely -> INSUFFICIENT_EVIDENCE")
  assert((hyp?.missingEvidence.length ?? 0) === 1, `missing evidence lists exactly the one genuinely required metric (got ${hyp?.missingEvidence.length})`)
}

console.log("\n=== CASE 10: Contradicting evidence is preserved ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true), change("clicks", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "CONTRADICTED", `material clicks increase contradicts click-response-weakened -> CONTRADICTED (got ${hyp?.status})`)
  assert((hyp?.contradictingEvidence.length ?? 0) === 1, "contradicting evidence is explicitly recorded, not silently dropped")
}
console.log("\n=== CASE 11: Multiple mechanisms can coexist - one hypothesis does not erase another ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const delivery = findHyp(result, "DELIVERY_COST_INCREASED")
  const clickResponse = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(delivery?.status === "SUPPORTED" && clickResponse?.status === "SUPPORTED", "both mechanisms remain independently SUPPORTED, neither erases the other")
  assert(result.overallState === "MULTIPLE_MECHANISMS", `overall state correctly reflects multiple identified mechanisms (got ${result.overallState})`)
}

console.log("\n=== CASE 12: Creative fatigue is never inferred from CTR decline alone ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const hyp = findHyp(result, "CREATIVE_FATIGUE")
  assert(hyp?.status === "INSUFFICIENT_EVIDENCE", `creative fatigue stays INSUFFICIENT_EVIDENCE even with a strong CTR decline present (got ${hyp?.status})`)
  assert((hyp?.missingEvidence.length ?? 0) > 0, "explicit missing evidence is listed for creative fatigue")
}

console.log("\n=== CASE 13: Audience saturation is never inferred from CPM/CTR movement alone ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true)]))
  const hyp = findHyp(result, "AUDIENCE_SATURATION")
  assert(hyp?.status === "INSUFFICIENT_EVIDENCE", `audience saturation stays INSUFFICIENT_EVIDENCE even with CPM up + CTR down (got ${hyp?.status})`)
}

console.log("\n=== CASE 14: Landing-page/offer/checkout failure is never inferred - no such hypothesis exists at all ===")
{
  const result = runDiagnosticEngine(packet([change("costPerResult", "UP", true)]))
  const codes = result.hypotheses.map((h) => h.code)
  const forbidden = ["LANDING_PAGE_FAILURE", "OFFER_FAILURE", "CHECKOUT_FAILURE"]
  assert(!forbidden.some((f) => codes.includes(f as never)), "no landing-page/offer/checkout hypothesis exists in V1 at all - not even as an always-insufficient placeholder")
}

console.log("\n=== CASE 15: No universal CTR/CPM/ROAS benchmark exists anywhere in the module (structural proof) ===")
{
  // Deliberately excludes the module's own documentation comments,
  // which correctly use an illustrative phrase like "CTR below 1%"
  // to describe the ABSENCE of such a benchmark - a bare substring
  // search would incorrectly flag that prose as if it were a real
  // hardcoded threshold. This test instead strips comments first,
  // then searches only the executable code for a real comparison-
  // operator-plus-benchmark pattern.
  const rawSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/diagnosticEngine.ts"), "utf-8")
  const codeOnly = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  const forbidden = ["ctr < ", "ctr <=", "cpm > ", "cpm >=", "roas < 2", "€20", "$20"]
  const found = forbidden.filter((f) => codeOnly.includes(f))
  assert(found.length === 0, `no hardcoded universal benchmark literal exists in executable code (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 16: Confidence is evidence-strength, never a fabricated probability (structural + behavioral proof) ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true)]))
  const hyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(hyp?.confidence === "HIGH" || hyp?.confidence === "MODERATE" || hyp?.confidence === "LOW" || hyp?.confidence === null, "confidence is always one of the three categorical levels or null, never a numeric percentage")
  assert(typeof hyp?.confidence !== "number", "confidence is never a bare number/percentage")
}

console.log("\n=== CASE 17: HIGH confidence requires stronger evidence coverage than LOW/MODERATE ===")
{
  const highResult = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const lowResult = runDiagnosticEngine(packet([change("ctr", "DOWN", false), change("cpc", "UP", false)]))
  const highHyp = findHyp(highResult, "CLICK_RESPONSE_WEAKENED")
  const lowHyp = findHyp(lowResult, "CLICK_RESPONSE_WEAKENED")
  assert(highHyp?.confidence === "HIGH", "both metrics material -> HIGH")
  assert(lowHyp?.confidence === "LOW", `neither metric material (weak/borderline signal) -> LOW (got ${lowHyp?.confidence})`)
}

console.log("\n=== CASE 18: Conflicting evidence prevents unjustified high confidence (forces CONTRADICTED, not HIGH) ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true), change("clicks", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.confidence === null, `a CONTRADICTED hypothesis carries no confidence level at all, never a fabricated HIGH (got ${hyp?.confidence})`)
}

console.log("\n=== CASE 19: Diagnostic result preserves current/comparison periods exactly ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true)], { currentPeriod: { start: "2026-01-01", end: "2026-01-07" }, comparisonPeriod: { start: "2025-12-25", end: "2025-12-31" } }))
  assert(result.currentPeriod.start === "2026-01-01" && result.comparisonPeriod.start === "2025-12-25", "periods preserved exactly, not recomputed")
}

console.log("\n=== CASE 20: Diagnostic result preserves factual supporting metrics exactly ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true, 47.3)]))
  const hyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(hyp?.supportingEvidence[0]?.percentChange === 47.3, `exact factual percentChange preserved in supporting evidence (got ${hyp?.supportingEvidence[0]?.percentChange})`)
}
console.log("\n=== CASE 21: Diagnostic Engine cannot consume arbitrary raw Meta rows or MonitorResult (structural/type proof) ===")
{
  // TypeScript itself enforces this: runDiagnosticEngine's parameter
  // type is DiagnosticEvidencePacket | null. This test documents that
  // boundary and confirms the function still behaves safely when
  // given a minimal, correctly-typed packet with no extra fields.
  const minimalPacket = packet([change("cpm", "UP", true)])
  const result = runDiagnosticEngine(minimalPacket)
  assert(result.overallState !== "NO_DIAGNOSIS", "the ONLY accepted input shape is a genuine DiagnosticEvidencePacket, and it works correctly")
}

console.log("\n=== CASE 22: No recommendation/action fields exist anywhere in the hypothesis or result contract ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const serialized = JSON.stringify(result).toLowerCase()
  const forbidden = ["recommend", "pause", "scale", "budget", "action", "shouldpause", "nextbestaction"]
  const found = forbidden.filter((w) => serialized.includes(w))
  assert(found.length === 0, `zero recommendation/action language or fields anywhere in the result (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 23: No Meta provider call / Meta mutation / AI call path exists (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/diagnosticEngine.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "anthropic", "openai", "graphapimetaadsprovider"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `zero network/AI/Meta primitives exist in diagnosticEngine.ts (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 24: Malformed input (packet with unknown metric name) fails closed, not fabricated ===")
{
  const result = runDiagnosticEngine(packet([change("totallyUnknownMetric", "UP", true)]))
  const hyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(hyp?.status === "INSUFFICIENT_EVIDENCE", "an unrecognized metric name in the packet does not get mistaken for a required metric")
}

console.log("\n=== CASE 25: Owner target variance does not become causal diagnosis (structural proof - no target parameter exists) ===")
{
  const result = runDiagnosticEngine(packet([change("costPerResult", "UP", true)]))
  const hyp = findHyp(result, "COST_PER_RESULT_INCREASED")
  assert(hyp?.status === "SUPPORTED", "diagnosis derives purely from the packet's own metric evidence, with no owner-target input available to distort it")
}

console.log("\n=== CASE 26: Customer wording does not overstate unsupported root cause (structural proof on labels) ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const rootCauseHyps = result.hypotheses.filter((h) => h.category === "ROOT_CAUSE")
  assert(rootCauseHyps.every((h) => h.status === "INSUFFICIENT_EVIDENCE"), "every root-cause-category hypothesis remains INSUFFICIENT_EVIDENCE in V1, regardless of mechanism-level evidence strength")
  assert(result.unresolvedQuestions.some((q) => q.toLowerCase().includes("root cause") && q.toLowerCase().includes("not")), "an explicit unresolved-root-cause note accompanies any identified mechanism")
}

console.log("\n=== CLOSURE 1: Correlated metrics (CTR down + CPC up from the SAME clicks decline) do not falsely inflate confidence to HIGH when CPM confounds ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "SUPPORTED", "click response weakened is still genuinely supported")
  assert(hyp?.confidence === "MODERATE", `confidence is capped at MODERATE when CPM also confounds, never fabricated HIGH from correlated CPC movement alone (got ${hyp?.confidence})`)
}

console.log("\n=== CLOSURE 2 (CPC decomposition Case A): CPM stable + CTR down + CPC up -> strong click-response support, HIGH confidence ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UNCHANGED", false), change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const clickHyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  const deliveryHyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(clickHyp?.status === "SUPPORTED" && clickHyp?.confidence === "HIGH", `CPM stable rules out the competing explanation -> HIGH confidence for click response (got ${clickHyp?.confidence})`)
  assert(deliveryHyp?.status === "NOT_APPLICABLE", "delivery-cost-increased correctly NOT triggered when CPM itself did not increase")
}

console.log("\n=== CLOSURE 3 (CPC decomposition Case B): CPM up + CTR stable + CPC up -> delivery-cost support, HIGH confidence, click-response NOT triggered ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "UNCHANGED", false), change("cpc", "UP", true)]))
  const clickHyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  const deliveryHyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(deliveryHyp?.status === "SUPPORTED" && deliveryHyp?.confidence === "HIGH", `CTR stable rules out the competing explanation -> HIGH confidence for delivery cost (got ${deliveryHyp?.confidence})`)
  assert(clickHyp?.status === "NOT_APPLICABLE", "click-response-weakened correctly NOT triggered when CTR itself did not decline")
}

console.log("\n=== CLOSURE 4 (CPC decomposition Case C): CPM up + CTR down + CPC up -> BOTH mechanisms supported, neither forced to MODERATE-only-one, neither falsely HIGH ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true), change("cpc", "UP", true)]))
  const clickHyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  const deliveryHyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(clickHyp?.status === "SUPPORTED" && deliveryHyp?.status === "SUPPORTED", "both mechanisms are supported - JARVIS does not force CPC deterioration into only one explanation")
  assert(clickHyp?.confidence === "MODERATE" && deliveryHyp?.confidence === "MODERATE", `neither mechanism reaches HIGH given the genuine ambiguity (got click=${clickHyp?.confidence}, delivery=${deliveryHyp?.confidence})`)
}

console.log("\n=== CLOSURE 5: CPA increase WITHOUT any conversion-rate evidence never becomes an unsupported post-click claim - the mechanism name itself makes no such claim ===")
{
  // costPerResult = spend/results; its genuine confound (sharing the
  // "spend" component) is cpc = spend/clicks - cpm/ctr are the wrong
  // confound to test here (those belong to the click-response and
  // delivery-cost rules respectively).
  const result = runDiagnosticEngine(packet([change("costPerResult", "UP", true), change("cpc", "UP", true)]))
  const hyp = findHyp(result, "COST_PER_RESULT_INCREASED")
  assert(hyp?.status === "SUPPORTED", "cost-per-result increase is genuinely supported as a factual observation")
  assert(hyp?.confidence === "MODERATE", `confidence capped at MODERATE since the genuine CPC (upstream acquisition cost) confound is active (got ${hyp?.confidence})`)
  assert(hyp?.label.toLowerCase().includes("post-click") === false, "the mechanism's own label never claims a post-click-specific attribution")
  assert((hyp?.missingEvidence.length ?? 0) > 0, "the absence of a direct conversion-rate signal is explicitly and always noted for this mechanism")
}

console.log("\n=== CLOSURE 5b: Cost-per-result increase with NO active cpc confound reaches HIGH, still with no post-click attribution ===")
{
  const result = runDiagnosticEngine(packet([change("costPerResult", "UP", true), change("cpc", "UNCHANGED", false)]))
  const hyp = findHyp(result, "COST_PER_RESULT_INCREASED")
  assert(hyp?.confidence === "HIGH", `no active upstream confound -> HIGH confidence (got ${hyp?.confidence})`)
  assert((hyp?.missingEvidence.length ?? 0) > 0, "even at HIGH confidence, the missing conversion-rate signal is still explicitly noted - HIGH here means confidence in the cost-per-result trend itself, never a post-click attribution")
}

console.log("\n=== CLOSURE 6: ROAS decline alone does not become an unsupported/overbroad root cause - confidence reflects volume confounding ===")
{
  const confounded = runDiagnosticEngine(packet([change("roas", "DOWN", true), change("results", "DOWN", true)]))
  const clean = runDiagnosticEngine(packet([change("roas", "DOWN", true), change("results", "UNCHANGED", false)]))
  const confoundedHyp = findHyp(confounded, "REVENUE_EFFICIENCY_WEAKENED")
  const cleanHyp = findHyp(clean, "REVENUE_EFFICIENCY_WEAKENED")
  assert(confoundedHyp?.confidence === "MODERATE", `a genuine concurrent conversion-volume decline caps confidence at MODERATE, never HIGH (got ${confoundedHyp?.confidence})`)
  assert(cleanHyp?.confidence === "HIGH", `when conversion volume is stable, ROAS decline alone reaches HIGH (got ${cleanHyp?.confidence})`)
  assert((confoundedHyp?.label ?? "").toLowerCase().includes("root cause") === false, "the label itself never claims to be a root cause")
}

console.log("\n=== CLOSURE 7 (adversarial contradiction): CTR down + clicks up + impressions up substantially + CPC up -> CONTRADICTED, not falsely HIGH ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "DOWN", true), change("clicks", "UP", true), change("impressions", "UP", true), change("cpc", "UP", true)]))
  const hyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  assert(hyp?.status === "CONTRADICTED", `a genuine material rise in clicks contradicts the click-response-weakened story despite CTR/CPC both moving in the 'expected' direction (got ${hyp?.status})`)
  assert(hyp?.confidence === null, "a CONTRADICTED hypothesis never carries a confidence level")
}

console.log("\n=== CLOSURE 8 (adversarial): CTR up + CPM up substantially + CPA up -> click-response NOT triggered, delivery-cost cleanly HIGH ===")
{
  const result = runDiagnosticEngine(packet([change("ctr", "UP", true), change("cpm", "UP", true), change("costPerResult", "UP", true)]))
  const clickHyp = findHyp(result, "CLICK_RESPONSE_WEAKENED")
  const deliveryHyp = findHyp(result, "DELIVERY_COST_INCREASED")
  assert(clickHyp?.status === "NOT_APPLICABLE", "CTR improving (UP) correctly never triggers click-response-weakened")
  assert(deliveryHyp?.status === "SUPPORTED" && deliveryHyp?.confidence === "HIGH", `delivery-cost-increased reaches HIGH cleanly since CTR moving UP rules out the competing explanation entirely (got ${deliveryHyp?.confidence})`)
}

console.log("\n=== CLOSURE 9: Determinism - the same packet always produces the identical DiagnosticResult ===")
{
  const p = packet([change("cpm", "UP", true, 33.3), change("ctr", "DOWN", true, -21.7), change("costPerResult", "UP", true, 44.4)])
  const resultA = runDiagnosticEngine(p)
  const resultB = runDiagnosticEngine(p)
  assert(JSON.stringify(resultA) === JSON.stringify(resultB), "calling runDiagnosticEngine twice on the identical packet produces byte-identical results - no timestamps, randomness, or runtime state leak in")
}

console.log("\n=== CLOSURE 10: Entity/workspace/brand provenance remains exact through the redesigned rules (structural regression guard) ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true)], { entityType: "AD", entityId: "ad_closure_1", workspaceId: "ws_closure", brandId: "brand_closure" }))
  assert(result.entityType === "AD" && result.entityId === "ad_closure_1", "entity provenance is untouched by the confidence-model rewrite")
}

console.log("\n=== CLOSURE 11: Unsupported root causes (bad targeting, bad offer, pricing, product) remain structurally impossible to assert - no such hypothesis codes exist at all ===")
{
  const result = runDiagnosticEngine(packet([change("cpm", "UP", true), change("ctr", "DOWN", true), change("costPerResult", "UP", true), change("roas", "DOWN", true)]))
  const codes = result.hypotheses.map((h) => h.code)
  const forbidden = ["BAD_TARGETING", "BAD_OFFER", "PRICING_PROBLEM", "PRODUCT_PROBLEM", "BAD_LANDING_PAGE", "CHECKOUT_PROBLEM"]
  assert(!forbidden.some((f) => codes.includes(f as never)), "none of these root-cause codes exist anywhere in the registry, even under maximal evidence pressure")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }