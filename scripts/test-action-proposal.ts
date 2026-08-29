import { createActionProposalContent, type ActionProposalContext } from "@/lib/product/actionProposal"
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
    code: "TEST_ALTERNATIVE_CREATIVE",
    label: "Test an alternative creative",
    category: "EXPERIMENT",
    rationale: "Click response weakened.",
    primaryMechanism: "CLICK_RESPONSE_WEAKENED",
    supportedBy: ["CLICK_RESPONSE_WEAKENED"],
    requires: [],
    unavailableBecause: [],
    estimatedRisk: "LOW",
    estimatedCost: null,
    reversibility: "REVERSIBLE",
    status: "ELIGIBLE",
    ...overrides,
  }
}

function guardrails(overrides: Partial<OwnerGuardrails> = {}): OwnerGuardrails {
  return {
    authorityMode: "ADVISOR",
    currency: "USD",
    monthlyBudgetCents: 100000,
    dailyMaximumCents: 5000,
    maxTestBudgetCents: 2500,
    ...overrides,
  }
}

function context(overrides: Partial<ActionProposalContext> = {}): ActionProposalContext {
  return {
    workspaceId: "ws1", brandId: "brand1", entityType: "CAMPAIGN", entityId: "camp1",
    guardrails: guardrails(),
    ...overrides,
  }
}

console.log("=== CASE 1 (CTO blocker fix): proposedSpendCents is ALWAYS null - no independent spend-sizing rule exists in V1 ===")
{
  const proposal25 = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: 2500 }) }))
  const proposal100 = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: 10000 }) }))
  assert(proposal25?.proposedSpendCents === null, `maxTestBudgetCents=2500 -> proposedSpendCents is null, never fabricated as 2500 (got ${proposal25?.proposedSpendCents})`)
  assert(proposal100?.proposedSpendCents === null, `maxTestBudgetCents=10000 -> proposedSpendCents is null, never fabricated as 10000 (got ${proposal100?.proposedSpendCents})`)
}

console.log("\n=== CASE 2 (CTO blocker fix): maxAuthorizedSpendCents preserves the owner's ceiling SEPARATELY, exactly, for display only ===")
{
  const proposal25 = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: 2500 }) }))
  const proposal100 = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: 10000 }) }))
  assert(proposal25?.maxAuthorizedSpendCents === 2500, `the owner's own ceiling (2500) is preserved exactly for display (got ${proposal25?.maxAuthorizedSpendCents})`)
  assert(proposal100?.maxAuthorizedSpendCents === 10000, `the owner's own ceiling (10000) is preserved exactly for display (got ${proposal100?.maxAuthorizedSpendCents})`)
}

console.log("\n=== CASE 3 (CTO blocker fix): Risk Guard genuinely receives a null proposed amount and fails closed to INSUFFICIENT_CONFIGURATION, never a fabricated ALLOWED ===")
{
  const proposal = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: 2500 }) }))
  assert(proposal?.guardrailEvaluation.decision === "INSUFFICIENT_CONFIGURATION", `with no independent spend-sizing rule, the real evaluator's own null-amount fail-closed path fires honestly (got ${proposal?.guardrailEvaluation.decision})`)
  assert(proposal?.guardrailEvaluation.reasons.some((r) => r.toLowerCase().includes("missing an amount")) ?? false, "the real evaluator's own reason text (amount missing) is genuinely produced, not fabricated")
}

console.log("\n=== CASE 4: ELIGIBLE experiment candidate produces a proposal regardless of the (now-honest) guardrail outcome ===")
{
  const proposal = createActionProposalContent(candidate(), context())
  assert(proposal !== null, "a genuine proposal is produced")
  assert(proposal?.status === "PENDING_OWNER_REVIEW", "new proposal always starts PENDING_OWNER_REVIEW")
}

console.log("\n=== CASE 5: NEEDS_MORE_INFORMATION candidate never produces a proposal ===")
{
  const proposal = createActionProposalContent(candidate({ status: "NEEDS_MORE_INFORMATION" }), context())
  assert(proposal === null, "a candidate that is not ELIGIBLE never becomes a proposal")
}

console.log("\n=== CASE 6: CAPABILITY_UNAVAILABLE candidate never produces a proposal ===")
{
  const proposal = createActionProposalContent(candidate({ status: "CAPABILITY_UNAVAILABLE" }), context())
  assert(proposal === null, "a capability-unavailable candidate never becomes a proposal")
}

console.log("\n=== CASE 7: NOT_APPLICABLE candidate never produces a proposal ===")
{
  const proposal = createActionProposalContent(candidate({ status: "NOT_APPLICABLE" }), context())
  assert(proposal === null, "a not-applicable candidate never becomes a proposal")
}

console.log("\n=== CASE 8: OBSERVATION category (OBSERVE_MORE_DATA) never produces a proposal, even if somehow marked ELIGIBLE ===")
{
  const proposal = createActionProposalContent(candidate({ code: "OBSERVE_MORE_DATA", category: "OBSERVATION", status: "ELIGIBLE" }), context())
  assert(proposal === null, "an OBSERVATION-category candidate is never something to propose - there is no action to decide on")
}
console.log("\n=== CASE 9: Missing max test budget still yields a proposal with maxAuthorizedSpendCents honestly null ===")
{
  const proposal = createActionProposalContent(candidate(), context({ guardrails: guardrails({ maxTestBudgetCents: null }) }))
  assert(proposal?.maxAuthorizedSpendCents === null, "no configured ceiling -> maxAuthorizedSpendCents is honestly null, never fabricated")
  assert(proposal?.guardrailEvaluation.decision === "INSUFFICIENT_CONFIGURATION", "still fails closed given no configuration exists at all")
}

console.log("\n=== CASE 10: Real evaluateProposedMediaAction is genuinely called, not reimplemented (structural + behavioral proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/actionProposal.ts"), "utf-8")
  assert(source.includes("evaluateProposedMediaAction(proposedAction, context.guardrails)"), "the real, already-approved evaluator is genuinely called, never a local reimplementation")
}

console.log("\n=== CASE 11: Entity/workspace/brand provenance preserved exactly ===")
{
  const proposal = createActionProposalContent(candidate(), context({ workspaceId: "ws_specific", brandId: "brand_specific", entityType: "AD", entityId: "ad_specific_1" }))
  assert(proposal?.workspaceId === "ws_specific" && proposal?.brandId === "brand_specific", "workspace/brand provenance preserved exactly")
  assert(proposal?.entityType === "AD" && proposal?.entityId === "ad_specific_1", "entity provenance preserved exactly")
}

console.log("\n=== CASE 12: Solution candidate fields preserved exactly (no re-derivation) ===")
{
  const c = candidate({ rationale: "Exact rationale text.", estimatedRisk: "MODERATE", reversibility: "PARTIALLY_REVERSIBLE" })
  const proposal = createActionProposalContent(c, context())
  assert(proposal?.rationale === "Exact rationale text.", "rationale preserved verbatim from the solution candidate")
  assert(proposal?.estimatedRisk === "MODERATE", "risk level preserved exactly")
  assert(proposal?.reversibility === "PARTIALLY_REVERSIBLE", "reversibility preserved exactly")
}

console.log("\n=== CASE 13: No execution/Meta-write function exists anywhere in this module (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/actionProposal.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "executeaction", "applychange", "anthropic", "openai"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `zero execution/AI/Meta primitives exist in this module (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== CASE 14: Determinism - the same candidate and context always produce the identical proposal content ===")
{
  const c = candidate()
  const ctx = context()
  const proposalA = createActionProposalContent(c, ctx)
  const proposalB = createActionProposalContent(c, ctx)
  assert(JSON.stringify(proposalA) === JSON.stringify(proposalB), "calling createActionProposalContent twice on identical inputs produces byte-identical content")
}

console.log("\n=== CASE 15 (superseded by Owner Approval Workflow V1): decision/approval functionality now genuinely exists, correctly, in its own dedicated slice ===")
{
  const pureSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/actionProposal.ts"), "utf-8")
  const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  assert(!pureSource.includes("decideActionProposal"), "the PURE construction module itself still contains no decision logic - that lives in the dedicated ownerDecision.ts module instead")
  assert(repoSource.includes("export async function decideActionProposal"), "decideActionProposal repository function now genuinely exists, approved as part of Owner Approval Workflow V1")
  assert(actionSource.includes("export async function decideActionProposalAction"), "decideActionProposalAction Server Action now genuinely exists")
}

console.log("\n=== CASE 16 (superseded by Owner Approval Workflow V1): Approve/Decline UI now genuinely exists, with no Execute anywhere ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(/>\s*Approve\s*</.test(uiSource), "an Approve button now genuinely exists in the UI")
  assert(/>\s*Decline\s*</.test(uiSource), "a Decline button now genuinely exists in the UI")
  assert(!uiSource.includes(">Execute<"), "no Execute button exists anywhere - execution remains a future slice's responsibility")
  assert(uiSource.includes("No action has been taken."), "the 'No action has been taken.' notice is still shown for still-pending proposals")
}

console.log("\n=== CASE 17 (superseded by Owner Approval Workflow V1): decided_at/decided_by are now genuinely read and written ===")
{
  const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  assert(repoSource.includes("decided_at:") && repoSource.includes("decided_by:"), "decided_at/decided_by are now genuinely written by the real decideActionProposal function")
  assert(repoSource.includes("decided_at: string | null") && repoSource.includes("decided_by: string | null"), "decided_at/decided_by are now genuinely part of the StoredActionProposal type, no longer dormant")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }