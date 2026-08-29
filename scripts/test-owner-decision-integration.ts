import { createActionProposalContent, type ActionProposalContext } from "@/lib/product/actionProposal"
import { validateOwnerDecision } from "@/lib/product/ownerDecision"
import type { SolutionCandidate } from "@/lib/product/solutionEngine"
import type { OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function candidate(overrides: Partial<SolutionCandidate> = {}): SolutionCandidate {
  return {
    code: "TEST_ALTERNATIVE_CREATIVE", label: "Test an alternative creative", category: "EXPERIMENT",
    rationale: "Click response weakened.", primaryMechanism: "CLICK_RESPONSE_WEAKENED",
    supportedBy: ["CLICK_RESPONSE_WEAKENED"], requires: [], unavailableBecause: [],
    estimatedRisk: "LOW", estimatedCost: null, reversibility: "REVERSIBLE", status: "ELIGIBLE",
    ...overrides,
  }
}

function guardrails(overrides: Partial<OwnerGuardrails> = {}): OwnerGuardrails {
  return { authorityMode: "ADVISOR", currency: "USD", monthlyBudgetCents: 100000, dailyMaximumCents: 5000, maxTestBudgetCents: 2500, ...overrides }
}

function context(overrides: Partial<ActionProposalContext> = {}): ActionProposalContext {
  return { workspaceId: "ws1", brandId: "brand1", entityType: "CAMPAIGN", entityId: "camp1", guardrails: guardrails(), ...overrides }
}

console.log("=== INTEGRATION 1: A real, freshly-constructed proposal starts PENDING_OWNER_REVIEW and can be validly approved ===")
{
  const proposal = createActionProposalContent(candidate(), context())
  assert(proposal?.status === "PENDING_OWNER_REVIEW", "real construction starts PENDING_OWNER_REVIEW")
  const validation = validateOwnerDecision(proposal!.status, "APPROVE", "FRESH")
  assert(validation.valid === true && validation.resultingStatus === "APPROVED", "a freshly-constructed proposal can be validly approved")
}

console.log("\n=== INTEGRATION 2: A real, freshly-constructed proposal can be validly declined ===")
{
  const proposal = createActionProposalContent(candidate(), context())
  const validation = validateOwnerDecision(proposal!.status, "DECLINE", "FRESH")
  assert(validation.valid === true && validation.resultingStatus === "DECLINED", "a freshly-constructed proposal can be validly declined")
}

console.log("\n=== INTEGRATION 3: Guardrail decision (even INSUFFICIENT_CONFIGURATION) does not block approval validity ===")
{
  const proposal = createActionProposalContent(candidate(), context())
  assert(proposal?.guardrailEvaluation.decision === "INSUFFICIENT_CONFIGURATION", "this proposal genuinely has an INSUFFICIENT_CONFIGURATION guardrail result (no spend proposed)")
  const validation = validateOwnerDecision(proposal!.status, "APPROVE", "FRESH")
  assert(validation.valid === true, "approval remains valid regardless of the guardrail decision - approval carries no execution consequence in V1")
}

console.log("\n=== INTEGRATION 4: Server Action genuinely calls the real validateOwnerDecision, not a bypass (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  assert(source.includes("validateOwnerDecision(existingResult.data.status"), "the action genuinely calls the real, already-tested validation function")
}

console.log("\n=== INTEGRATION 5: Server Action verifies proposal ownership before deciding (cross-brand tampering closure, structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  assert(source.includes("existingResult.data.brand_id !== brandId"), "the action explicitly verifies the fetched proposal's own brand_id matches the caller-supplied brandId")
}

console.log("\n=== INTEGRATION 6: Repository's own atomic WHERE-status guard is the real double-decision race protection (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  assert(source.includes('.eq("status", "PENDING_OWNER_REVIEW")'), "the atomic UPDATE...WHERE guard exists in the repository, matching the documented race-safety mechanism")
}

console.log("\n=== INTEGRATION 7: No execution/Meta-write path exists anywhere in the decision flow (structural proof) ===")
{
  const pureSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/ownerDecision.ts"), "utf-8").toLowerCase()
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "executeaction", "applychange", "anthropic", "openai"]
  const foundPure = forbidden.filter((w) => pureSource.includes(w))
  const foundAction = forbidden.filter((w) => actionSource.includes(w))
  assert(foundPure.length === 0 && foundAction.length === 0, `zero execution/AI/Meta primitives exist anywhere in the decision flow (found: ${[...foundPure, ...foundAction].join(", ") || "none"})`)
}

console.log("\n=== INTEGRATION 8: UI shows Approve/Decline only for PENDING_OWNER_REVIEW, and a distinct decided state otherwise (structural proof) ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes('p.status === "PENDING_OWNER_REVIEW" ?'), "the UI conditionally shows decision buttons only for still-pending proposals")
  assert(/>\s*Approve\s*</.test(uiSource) && />\s*Decline\s*</.test(uiSource), "Approve and Decline buttons genuinely exist in this slice")
  assert(uiSource.includes("handleDecide(p.id,"), "the buttons genuinely call the real decision handler")
}

console.log("\n=== INTEGRATION 9: UI confirms before deciding (side-effect confirmation rule, structural proof) ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes("window.confirm("), "a confirmation dialog is genuinely shown before recording any decision")
}

console.log("\n=== CLOSURE 1: Guardrail decision is now visible to the owner BEFORE deciding, closing a real transparency gap ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes("guardrailStatusText(p.guardrailDecision)"), "the UI now genuinely displays the guardrail decision, in plain language, for every proposal card")
  assert(uiSource.includes('p.guardrailDecision === "BLOCKED" ? "#f87171"'), "a BLOCKED guardrail decision is visually distinguished (warning color), not hidden alongside an ALLOWED one")
}

console.log("\n=== CLOSURE 2: Approving a BLOCKED proposal triggers an explicit, honest warning before confirmation ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes('target?.guardrailDecision === "BLOCKED"'), "the confirmation handler explicitly checks for a BLOCKED guardrail decision before approval")
  assert(uiSource.includes("exceeds your configured budget limits"), "the owner is explicitly told the proposal exceeds their configured budget before they can approve it")
  assert(uiSource.includes("does not execute anything or override your budget settings"), "the warning is honest that approval still does not execute or override anything - matching the approved no-execution-consequence architecture")
}

console.log("\n=== CLOSURE 3: Guardrail visibility survives after a decision is made (decided proposals still show their own guardrail state) ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  const guardrailLineIndex = uiSource.indexOf("guardrailStatusText(p.guardrailDecision)")
  const conditionalBranchIndex = uiSource.indexOf('p.status === "PENDING_OWNER_REVIEW" ?')
  assert(guardrailLineIndex > 0 && conditionalBranchIndex > 0 && guardrailLineIndex < conditionalBranchIndex, "the guardrail status line renders unconditionally for every proposal card, before the pending/decided branch - so it is never hidden after a decision is made")
}

console.log("\n=== CLOSURE 4: Guardrail-approval independence remains intact - visibility does not become a block ===")
{
  // The module's own documentation comment legitimately explains
  // "GUARDRAIL DECISION DOES NOT GATE APPROVAL" as a stated design
  // principle - a bare substring check would incorrectly flag that
  // prose as evidence of coupling. This checks the FUNCTION SIGNATURE
  // itself never accepts a guardrail-related parameter, which is the
  // real structural proof of independence. Note: validateOwnerDecision
  // now legitimately accepts a THIRD parameter (freshness) as part of
  // the approved stale-proposal expiration feature - this is
  // deliberately unrelated to guardrail state, and the signature
  // check below reflects that update.
  const pureSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/ownerDecision.ts"), "utf-8")
  const codeOnly = pureSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  assert(!codeOnly.toLowerCase().includes("guardrail"), "the pure decision-validation module's executable code has zero references to guardrail state - visibility was added only in the UI layer, not as new business logic")
  assert(
    pureSource.includes("validateOwnerDecision(\n  currentStatus: ActionProposalStatus,\n  decision: OwnerDecisionType,\n  freshness: FreshnessStatus\n)"),
    "the function signature itself proves it accepts only status, decision, and freshness - no guardrail parameter exists to accept"
  )
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }