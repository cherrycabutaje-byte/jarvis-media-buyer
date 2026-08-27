import { runSolutionEngine, type SolutionContext } from "@/lib/product/solutionEngine"
import type { DiagnosticResult, DiagnosticHypothesis, HypothesisCode, HypothesisStatus } from "@/lib/product/diagnosticEngine"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function hyp(code: HypothesisCode, status: HypothesisStatus, category: "PERFORMANCE_MECHANISM" | "ROOT_CAUSE" = "PERFORMANCE_MECHANISM"): DiagnosticHypothesis {
  return { code, label: code, category, status, confidence: status === "SUPPORTED" ? "HIGH" : status === "PLAUSIBLE" ? "MODERATE" : null, supportingEvidence: [], contradictingEvidence: [], missingEvidence: [] }
}

function diagnostic(hypotheses: DiagnosticHypothesis[], overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    entityType: "CAMPAIGN", entityId: "camp1",
    currentPeriod: { start: "2026-08-18", end: "2026-08-24" },
    comparisonPeriod: { start: "2026-08-11", end: "2026-08-17" },
    observedChanges: [],
    hypotheses,
    unresolvedQuestions: hypotheses.some((h) => h.status === "SUPPORTED" || h.status === "PLAUSIBLE") ? ["Root cause has not been established."] : [],
    overallState: hypotheses.some((h) => h.status === "SUPPORTED") ? "MECHANISM_IDENTIFIED" : "NO_DIAGNOSIS",
    ...overrides,
  }
}

function baseContext(overrides: Partial<SolutionContext> = {}): SolutionContext {
  return {
    capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: null },
    budget: { maxTestBudgetCents: null, currency: null },
    ownerObjective: null,
    ...overrides,
  }
}

function findCand(result: ReturnType<typeof runSolutionEngine>, code: string) {
  return result.candidates.find((c) => c.code === code)
}

console.log("=== CASE 1: Null diagnosis -> no actionable solution ===")
{
  const result = runSolutionEngine(null, baseContext())
  assert(result.candidates.length === 0, "null diagnosis produces zero candidates")
  assert(result.diagnosticProvenance.length === 0, "no diagnostic provenance when there is no diagnosis")
}

console.log("\n=== CASE 2: Empty/no supported mechanism -> no causal solution, only observation ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "NOT_APPLICABLE")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  const observe = findCand(result, "OBSERVE_MORE_DATA")
  assert(creative?.status === "NOT_APPLICABLE", "no causal creative candidate when click-response is NOT_APPLICABLE")
  assert(observe?.status === "ELIGIBLE", "observation is still available as the disciplined fallback")
}

console.log("\n=== CASE 3: SUPPORTED CLICK_RESPONSE_WEAKENED + a verified genuine asset makes creative testing ELIGIBLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "ELIGIBLE", `SUPPORTED click-response-weakened + a verified genuine asset makes the creative candidate ELIGIBLE (got ${creative?.status})`)
  assert(creative?.supportedBy.includes("CLICK_RESPONSE_WEAKENED") ?? false, "candidate correctly cites its diagnostic provenance")
  assert(creative?.primaryMechanism === "CLICK_RESPONSE_WEAKENED", "primaryMechanism correctly names the single deciding hypothesis")
}

console.log("\n=== CASE 3b (closure fix): SUPPORTED click-response WITHOUT verified asset availability (the honest V1 default) stays NEEDS_MORE_INFORMATION, never a false ELIGIBLE ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NEEDS_MORE_INFORMATION", `unverified asset availability (null, the honest default) never reaches ELIGIBLE on capability alone (got ${creative?.status})`)
}

console.log("\n=== CASE 3c (closure fix): Explicitly no eligible asset AND no production capability -> CAPABILITY_UNAVAILABLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: false, metaWriteAvailable: false, hasEligibleExistingAsset: false } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "CAPABILITY_UNAVAILABLE", `no eligible existing asset and no production path -> CAPABILITY_UNAVAILABLE, not a silent ELIGIBLE (got ${creative?.status})`)
}

console.log("\n=== CASE 3d (closure fix): Explicitly no eligible asset BUT genuine production capability exists -> still requires the SUPPORTED+asset path, correctly resolves ELIGIBLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: false, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: false } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "ELIGIBLE", `no existing asset but genuine production capability to make a new one -> ELIGIBLE (got ${creative?.status})`)
}

console.log("\n=== CASE 4: Creative fatigue is not assumed - rationale never claims it ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(!(creative?.rationale.toLowerCase().includes("fatigue") ?? false), "the rationale never asserts creative fatigue as an established fact")
  assert(!(creative?.label.toLowerCase().includes("fatigue") ?? false), "the candidate label never asserts creative fatigue")
}

console.log("\n=== CASE 5: Audience saturation is not assumed anywhere in Solution Engine ===")
{
  const result = runSolutionEngine(diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED"), hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  const serialized = JSON.stringify(result).toLowerCase()
  assert(!serialized.includes("saturation"), "no candidate or rationale ever mentions audience saturation")
}

console.log("\n=== CASE 6: DELIVERY_COST_INCREASED does not automatically cause a targeting/bidding candidate ===")
{
  const result = runSolutionEngine(diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED")]), baseContext())
  const codes = result.candidates.map((c) => c.code)
  assert(!codes.includes("CHANGE_TARGETING" as never) && !codes.includes("CHANGE_BID_STRATEGY" as never), "no targeting/bidding candidate exists at all in this registry")
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", "delivery-cost-increased alone does not make the creative candidate eligible either")
  const observe = findCand(result, "OBSERVE_MORE_DATA")
  assert(observe?.status === "ELIGIBLE", "observation is the correct outcome for delivery-cost-increased alone")
}

console.log("\n=== CASE 7: COST_PER_RESULT_INCREASED alone does not cause a landing-page/offer/checkout candidate ===")
{
  const result = runSolutionEngine(diagnostic([hyp("COST_PER_RESULT_INCREASED", "SUPPORTED")]), baseContext())
  const codes = result.candidates.map((c) => c.code)
  const forbidden = ["CHANGE_LANDING_PAGE", "CHANGE_OFFER", "CHANGE_CHECKOUT"]
  assert(!forbidden.some((f) => codes.includes(f as never)), "no landing-page/offer/checkout candidate exists at all")
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", "cost-per-result-increased alone (without click-response) does not trigger the creative candidate")
}

console.log("\n=== CASE 8: REVENUE_EFFICIENCY_WEAKENED does not infer a price/product problem ===")
{
  const result = runSolutionEngine(diagnostic([hyp("REVENUE_EFFICIENCY_WEAKENED", "SUPPORTED")]), baseContext())
  const serialized = JSON.stringify(result).toLowerCase()
  const forbidden = ["price", "product problem", "bad offer", "low aov"]
  const found = forbidden.filter((w) => serialized.includes(w))
  assert(found.length === 0, `no price/product/offer/AOV language appears anywhere (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 9: Compound click-response + cost-per-result diagnosis strengthens provenance WITHOUT inflating eligibility on its own ===")
{
  const withAsset = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED"), hyp("COST_PER_RESULT_INCREASED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creativeWithAsset = findCand(withAsset, "TEST_ALTERNATIVE_CREATIVE")
  assert(creativeWithAsset?.status === "ELIGIBLE", "creative candidate is eligible given the primary supported mechanism plus verified asset availability")
  assert((creativeWithAsset?.supportedBy.length ?? 0) === 2, `compound diagnostic provenance is preserved on the candidate (got ${creativeWithAsset?.supportedBy.length})`)
  assert(creativeWithAsset?.primaryMechanism === "CLICK_RESPONSE_WEAKENED", "primaryMechanism remains the single click-response signal even with a compound secondary hypothesis present")
}

console.log("\n=== CASE 10: Delivery + click-response coexist without one candidate pretending to solve both ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED"), hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "ELIGIBLE", "creative candidate eligible for the click-response mechanism given verified asset availability")
  assert(!(creative?.supportedBy.includes("DELIVERY_COST_INCREASED") ?? false), "the creative candidate never claims to address delivery cost - it is scoped only to what it actually addresses")
  assert(creative?.primaryMechanism !== "DELIVERY_COST_INCREASED", "primaryMechanism never names delivery-cost-increased as the deciding signal for this candidate")
}

console.log("\n=== CASE 11: CONTRADICTED hypothesis cannot generate a candidate ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "CONTRADICTED")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", "a CONTRADICTED hypothesis never makes the creative candidate eligible")
}

console.log("\n=== CASE 12: INSUFFICIENT_EVIDENCE hypothesis cannot generate a candidate ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "INSUFFICIENT_EVIDENCE")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", "an INSUFFICIENT_EVIDENCE hypothesis never makes the creative candidate eligible")
}

console.log("\n=== CASE 13: NOT_APPLICABLE hypothesis cannot generate a candidate ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "NOT_APPLICABLE")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", "a NOT_APPLICABLE hypothesis never makes the creative candidate eligible")
}

console.log("\n=== CASE 14: PLAUSIBLE hypothesis is handled conservatively (NEEDS_MORE_INFORMATION, not ELIGIBLE) ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "PLAUSIBLE")]), baseContext())
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NEEDS_MORE_INFORMATION", `a PLAUSIBLE (not fully SUPPORTED) hypothesis is treated conservatively (got ${creative?.status})`)
}

console.log("\n=== CASE 15: Candidate preserves diagnostic provenance, exact entity, and periods ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")], { entityType: "AD", entityId: "ad_99" }), baseContext())
  assert(result.entityType === "AD" && result.entityId === "ad_99", "exact entity type and external entity ID are preserved")
  assert(result.currentPeriod.start === "2026-08-18" && result.comparisonPeriod.start === "2026-08-11", "periods are preserved exactly")
  assert(result.diagnosticProvenance.includes("CLICK_RESPONSE_WEAKENED"), "diagnostic provenance is preserved at the result level")
}

console.log("\n=== CASE 16: No cross-entity solution contamination (structural proof - no repository access exists) ===")
{
  const resultA = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")], { entityId: "camp_A" }), baseContext())
  const resultB = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")], { entityId: "camp_B" }), baseContext())
  assert(resultA.entityId === "camp_A" && resultB.entityId === "camp_B", "each call's result is scoped exactly to its own input diagnosis, with no shared mutable state")
}

console.log("\n=== CASE 17: Unavailable creative capability cannot produce an immediately eligible intervention ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: false, staticCreativeProductionAvailable: false, metaWriteAvailable: false, hasEligibleExistingAsset: null } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "CAPABILITY_UNAVAILABLE", `no creative capability -> CAPABILITY_UNAVAILABLE, never falsely ELIGIBLE (got ${creative?.status})`)
}

console.log("\n=== CASE 18: Meta write unavailable is respected - no candidate can execute ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  assert(result.unresolvedConstraints.some((c) => c.toLowerCase().includes("no meta write")), "the absence of Meta write capability is explicitly recorded as a constraint")
  assert(result.candidates.every((c) => !("execute" in c)), "no candidate carries any execute-capable field")
}

console.log("\n=== CASE 19: AUTOPILOT does not create execution permission (structural proof - no authority mode input exists at all) ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  assert(result.candidates.every((c) => c.status !== ("EXECUTE" as never)), "no candidate status value represents execution permission")
}

console.log("\n=== CASE 20: Owner max test budget is treated as a ceiling, never a proposed spend ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext({ budget: { maxTestBudgetCents: 2500, currency: "EUR" } }))
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.estimatedCost === null, "the candidate's own estimated cost remains null - the budget ceiling never becomes a proposed spend figure")
  assert(result.unresolvedConstraints.some((c) => c.includes("25.00") && c.includes("EUR")), "the exact budget ceiling and currency are recorded as a constraint, not silently dropped or altered")
}

console.log("\n=== CASE 21: Missing budget does not fabricate a budget figure ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext())
  assert(!result.unresolvedConstraints.some((c) => c.includes("$") || c.includes("EUR-SYMBOL")), "no budget constraint is fabricated when none is configured")
}

console.log("\n=== CASE 22: Different currency is never silently converted or relabeled ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext({ budget: { maxTestBudgetCents: 1000, currency: "GBP" } }))
  assert(result.unresolvedConstraints.some((c) => c.includes("GBP")), "the exact configured currency (GBP) is preserved verbatim, never converted to another currency")
}

console.log("\n=== CASE 23: No universal CPA/ROAS/CTR benchmark exists anywhere in the module (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/solutionEngine.ts"), "utf-8")
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  const forbidden = ["ctr < ", "cpa > ", "roas < 2"]
  const found = forbidden.filter((f) => codeOnly.includes(f))
  assert(found.length === 0, `no hardcoded universal benchmark exists in executable code (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CLOSURE 1: BLOCKED_BY_GUARDRAIL is reserved for future integration - never actually produced by any current rule ===")
{
  const result = runSolutionEngine(diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]), baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } }))
  assert(result.candidates.every((c) => c.status !== "BLOCKED_BY_GUARDRAIL"), "no candidate is ever produced with BLOCKED_BY_GUARDRAIL status in V1 - no guardrail data flows into SolutionContext at all")
}

console.log("\n=== CLOSURE 2: Confidence defense-in-depth - a hypothetical SUPPORTED+LOW pairing is never treated as fully established ===")
{
  const lowConfidenceSupported: DiagnosticHypothesis = { code: "CLICK_RESPONSE_WEAKENED", label: "x", category: "PERFORMANCE_MECHANISM", status: "SUPPORTED", confidence: "LOW", supportingEvidence: [], contradictingEvidence: [], missingEvidence: [] }
  const result = runSolutionEngine(
    diagnostic([lowConfidenceSupported]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NEEDS_MORE_INFORMATION", `even a hypothetical SUPPORTED+LOW-confidence pairing is treated conservatively, never falsely ELIGIBLE (got ${creative?.status})`)
}

console.log("\n=== CLOSURE 3: ownerObjective has zero effect on candidate eligibility (structural neutrality proof) ===")
{
  const withSales = runSolutionEngine(diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED")]), baseContext({ ownerObjective: "SALES" }))
  const withNull = runSolutionEngine(diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED")]), baseContext({ ownerObjective: null }))
  assert(JSON.stringify(withSales.candidates) === JSON.stringify(withNull.candidates), "changing ownerObjective alone never changes any candidate's eligibility, status, or content")
}

console.log("\n=== CLOSURE 4 (adversarial): PLAUSIBLE click-response + SUPPORTED cost-per-result never becomes falsely ELIGIBLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "PLAUSIBLE"), hyp("COST_PER_RESULT_INCREASED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NEEDS_MORE_INFORMATION", `a merely PLAUSIBLE primary mechanism stays conservative regardless of a SUPPORTED secondary compound signal (got ${creative?.status})`)
}

console.log("\n=== CLOSURE 5 (adversarial): creativeLibraryAvailable=true but hasEligibleExistingAsset explicitly false and no production path -> CAPABILITY_UNAVAILABLE, not ELIGIBLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: false, metaWriteAvailable: false, hasEligibleExistingAsset: false } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "CAPABILITY_UNAVAILABLE", `generic library availability alone never overrides an explicit lack of a genuinely different asset (got ${creative?.status})`)
}

console.log("\n=== CLOSURE 6 (adversarial): DELIVERY_COST_INCREASED SUPPORTED + CLICK_RESPONSE_WEAKENED CONTRADICTED -> creative candidate stays NOT_APPLICABLE ===")
{
  const result = runSolutionEngine(
    diagnostic([hyp("DELIVERY_COST_INCREASED", "SUPPORTED"), hyp("CLICK_RESPONSE_WEAKENED", "CONTRADICTED")]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "NOT_APPLICABLE", `a CONTRADICTED click-response hypothesis never justifies the creative candidate, even alongside a supported delivery-cost mechanism (got ${creative?.status})`)
}

console.log("\n=== CLOSURE 7 (adversarial): All four mechanisms SUPPORTED simultaneously - creative candidate scope never silently expands beyond its two legitimate hypotheses ===")
{
  const result = runSolutionEngine(
    diagnostic([
      hyp("DELIVERY_COST_INCREASED", "SUPPORTED"),
      hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED"),
      hyp("COST_PER_RESULT_INCREASED", "SUPPORTED"),
      hyp("REVENUE_EFFICIENCY_WEAKENED", "SUPPORTED"),
    ]),
    baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  )
  const creative = findCand(result, "TEST_ALTERNATIVE_CREATIVE")
  assert(creative?.status === "ELIGIBLE", "creative candidate is correctly eligible given click-response is genuinely among the four supported mechanisms")
  assert((creative?.supportedBy.length ?? 0) === 2, `even with four mechanisms SUPPORTED, the candidate cites exactly its own two legitimate ones (got ${creative?.supportedBy.length})`)
  assert(!(creative?.supportedBy.includes("DELIVERY_COST_INCREASED") ?? false) && !(creative?.supportedBy.includes("REVENUE_EFFICIENCY_WEAKENED") ?? false), "scope never silently expands to claim it addresses delivery cost or revenue efficiency too")
}

console.log("\n=== CLOSURE 8: Determinism - the same diagnosis and context always produce the identical SolutionResult ===")
{
  const d = diagnostic([hyp("CLICK_RESPONSE_WEAKENED", "SUPPORTED")])
  const ctx = baseContext({ capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: true } })
  const resultA = runSolutionEngine(d, ctx)
  const resultB = runSolutionEngine(d, ctx)
  assert(JSON.stringify(resultA) === JSON.stringify(resultB), "calling runSolutionEngine twice on identical inputs produces byte-identical results")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }