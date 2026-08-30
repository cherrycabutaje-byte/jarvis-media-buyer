import { evaluateSpecificationReadiness, type SpecificationReadinessInput, type BoundProposalInput, type DraftSpecificationInput } from "@/lib/product/concreteActionSpecification"
import type { OwnerGuardrails } from "@/lib/product/ownerGuardrails"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function proposal(overrides: Partial<BoundProposalInput> = {}): BoundProposalInput {
  return { status: "APPROVED", solutionCandidateCode: "TEST_ALTERNATIVE_CREATIVE", category: "EXPERIMENT", workspaceId: "ws1", brandId: "brand1", ...overrides }
}

function draft(overrides: Partial<DraftSpecificationInput> = {}): DraftSpecificationInput {
  return {
    actionType: "TEST_ALTERNATIVE_CREATIVE",
    metaAdAccountId: "act_123",
    targetEntityType: "AD_SET",
    targetEntityId: "adset_1",
    creativeAssetId: "asset_1",
    proposedSpendCents: null,
    currency: null,
    ...overrides,
  }
}

function guardrails(overrides: Partial<OwnerGuardrails> = {}): OwnerGuardrails {
  return { authorityMode: "ADVISOR", currency: "USD", monthlyBudgetCents: 100000, dailyMaximumCents: 5000, maxTestBudgetCents: 2500, ...overrides }
}

function input(overrides: Partial<SpecificationReadinessInput> = {}): SpecificationReadinessInput {
  return {
    proposal: proposal(),
    draft: draft(),
    creativeAssetOwnershipVerified: true,
    targetEntityOwnershipVerified: true,
    maxAuthorizedSpendCents: 2500,
    currentGuardrails: guardrails(),
    ...overrides,
  }
}

function hasReason(result: ReturnType<typeof evaluateSpecificationReadiness>, code: string): boolean {
  return result.reasons.some((r) => r.code === code)
}

console.log("=== CASE 1: Pending proposal cannot create a ready specification ===")
{
  const result = evaluateSpecificationReadiness(input({ proposal: proposal({ status: "PENDING_OWNER_REVIEW" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "PROPOSAL_NOT_APPROVED"), "a pending proposal cannot back a READY specification")
}

console.log("\n=== CASE 2: Declined proposal rejected ===")
{
  const result = evaluateSpecificationReadiness(input({ proposal: proposal({ status: "DECLINED" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "PROPOSAL_DECLINED"), "a declined proposal is rejected")
}

console.log("\n=== CASE 3: Expired proposal rejected ===")
{
  const result = evaluateSpecificationReadiness(input({ proposal: proposal({ status: "EXPIRED" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "PROPOSAL_EXPIRED"), "an expired proposal is rejected")
}

console.log("\n=== CASE 4: Approved proposal accepted as specification parent ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 1500, currency: "USD" }) }))
  assert(result.status === "READY", `an approved proposal with every field concrete evaluates READY (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
}

console.log("\n=== CASE 5: Action mismatch rejected ===")
{
  const result = evaluateSpecificationReadiness(
    input({ proposal: proposal({ solutionCandidateCode: "SOME_OTHER_ACTION" }) })
  )
  assert(result.status === "NOT_READY" && hasReason(result, "ACTION_MISMATCH"), "a specification action that does not match the proposal's own approved action is rejected")
}

console.log("\n=== CASE 6: OBSERVE_MORE_DATA rejected ===")
{
  const result = evaluateSpecificationReadiness(
    input({ proposal: proposal({ solutionCandidateCode: "OBSERVE_MORE_DATA", category: "OBSERVATION" }) })
  )
  assert(result.status === "NOT_READY" && hasReason(result, "ACTION_MISMATCH"), "an observation-category proposal can never produce a specification")
}

console.log("\n=== CASE 7: Missing Meta account -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ metaAdAccountId: null, proposedSpendCents: 1500, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_META_ACCOUNT"), "a missing Meta account blocks readiness")
}

console.log("\n=== CASE 8: Missing target -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ targetEntityId: null, proposedSpendCents: 1500, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_TARGET"), "a missing target blocks readiness")
}

console.log("\n=== CASE 9: Missing creative -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ creativeAssetId: null, proposedSpendCents: 1500, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_CREATIVE"), "a missing creative blocks readiness")
}

console.log("\n=== CASE 10: Missing spend -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: null, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_SPEND"), "a missing spend blocks readiness")
}

console.log("\n=== CASE 11: Zero spend -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 0, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "INVALID_SPEND"), "zero spend blocks readiness")
}

console.log("\n=== CASE 12: Negative spend -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: -500, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "INVALID_SPEND"), "negative spend blocks readiness")
}

console.log("\n=== CASE 13: Non-integer spend -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 1500.5, currency: "USD" }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "INVALID_SPEND"), "a non-integer spend blocks readiness")
}

console.log("\n=== CASE 14: Spend above maximum -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 3000, currency: "USD" }), maxAuthorizedSpendCents: 2500 }))
  assert(result.status === "NOT_READY" && hasReason(result, "SPEND_EXCEEDS_LIMIT"), "spend exceeding the maximum blocks readiness")
}

console.log("\n=== CASE 15: Missing currency -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 1500, currency: null }) }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_CURRENCY"), "missing currency blocks readiness")
}

console.log("\n=== CASE 16: Currency mismatch -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(
    input({ draft: draft({ proposedSpendCents: 1500, currency: "EUR" }), currentGuardrails: guardrails({ currency: "USD" }) })
  )
  assert(result.status === "NOT_READY" && hasReason(result, "CURRENCY_MISMATCH"), "a currency mismatch blocks readiness, no FX conversion")
}

console.log("\n=== CASE 17: Guardrail blocked -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(
    input({ draft: draft({ proposedSpendCents: 999999, currency: "USD" }), currentGuardrails: guardrails({ maxTestBudgetCents: 2500 }) })
  )
  assert(result.status === "NOT_READY" && hasReason(result, "GUARDRAIL_BLOCKED"), "a BLOCKED fresh guardrail re-evaluation blocks readiness")
}

console.log("\n=== CASE 18: Guardrail incomplete -> NOT_READY ===")
{
  const result = evaluateSpecificationReadiness(
    input({ draft: draft({ proposedSpendCents: 1500, currency: "USD" }), currentGuardrails: guardrails({ authorityMode: null }) })
  )
  assert(result.status === "NOT_READY" && hasReason(result, "GUARDRAIL_INCOMPLETE"), "an incomplete guardrail configuration blocks readiness")
}

console.log("\n=== CASE 19: Complete safe specification -> READY (positive control) ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: 1500, currency: "USD" }) }))
  assert(result.status === "READY", `a fully concrete, safe specification evaluates READY, proving the validator is not hardcoded to always reject (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  assert(result.reasons.length === 0, "a READY result carries zero blocking reasons")
}

console.log("\n=== CASE 20: Maximum budget never becomes proposed spend ===")
{
  const result = evaluateSpecificationReadiness(input({ draft: draft({ proposedSpendCents: null }), maxAuthorizedSpendCents: 2500 }))
  assert(hasReason(result, "MISSING_SPEND"), "a real maximum ceiling never substitutes for an actual proposed spend - MISSING_SPEND still fires with a ceiling present")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }