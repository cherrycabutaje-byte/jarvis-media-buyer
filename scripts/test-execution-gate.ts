import { evaluateExecutionEligibility, type ExecutionEligibilityInput, type ExecutionEligibilityProposalInput } from "@/lib/product/executionGate"
import type { OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function proposal(overrides: Partial<ExecutionEligibilityProposalInput> = {}): ExecutionEligibilityProposalInput {
  return {
    solutionCandidateCode: "TEST_ALTERNATIVE_CREATIVE",
    category: "EXPERIMENT",
    status: "APPROVED",
    createdAt: "2026-08-29T00:00:00.000Z",
    decidedAt: "2026-08-29T01:00:00.000Z",
    decidedBy: "user_1",
    entityType: "ACCOUNT",
    entityId: "act_123",
    proposedSpendCents: null,
    maxAuthorizedSpendCents: 2500,
    proposedCurrency: null,
    targetMetaEntityId: null,
    creativeAssetId: null,
    ...overrides,
  }
}

function guardrails(overrides: Partial<OwnerGuardrails> = {}): OwnerGuardrails {
  return {
    authorityMode: "ADVISOR", currency: "USD",
    monthlyBudgetCents: 100000, dailyMaximumCents: 5000, maxTestBudgetCents: 2500,
    ...overrides,
  }
}

function input(overrides: Partial<ExecutionEligibilityInput> = {}): ExecutionEligibilityInput {
  return {
    proposal: proposal(),
    currentGuardrails: guardrails(),
    currentMetaAdAccountId: "act_123",
    ...overrides,
  }
}

function hasReason(result: ReturnType<typeof evaluateExecutionEligibility>, code: string): boolean {
  return result.reasons.some((r) => r.code === code)
}

console.log("=== CASE 1: Pending proposal -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ status: "PENDING_OWNER_REVIEW" }) }))
  assert(result.status === "NOT_EXECUTABLE", "a pending proposal is never executable")
  assert(hasReason(result, "PROPOSAL_NOT_APPROVED"), "correct reason code for a pending proposal")
}

console.log("\n=== CASE 2: Declined proposal -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ status: "DECLINED" }) }))
  assert(result.status === "NOT_EXECUTABLE", "a declined proposal is never executable")
  assert(hasReason(result, "PROPOSAL_DECLINED"), "correct reason code for a declined proposal")
}

console.log("\n=== CASE 3: Expired proposal -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ status: "EXPIRED" }) }))
  assert(result.status === "NOT_EXECUTABLE", "an expired proposal is never executable")
  assert(hasReason(result, "PROPOSAL_EXPIRED"), "correct reason code for an expired proposal")
}

console.log("\n=== CASE 4: Approved proposal without decided_by -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ decidedBy: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "missing decidedBy is never silently repaired")
  assert(hasReason(result, "INVALID_APPROVAL_PROVENANCE"), "correct reason code for missing approval provenance")
}

console.log("\n=== CASE 5: Approved proposal without decided_at -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ decidedAt: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "missing decidedAt is never silently repaired")
  assert(hasReason(result, "INVALID_APPROVAL_PROVENANCE"), "correct reason code for missing approval provenance")
}

console.log("\n=== CASE 6: Approved + BLOCKED (fresh guardrail re-evaluation) -> NOT_EXECUTABLE ===")
{  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({ proposedSpendCents: 999999, proposedCurrency: "USD" }),
      currentGuardrails: guardrails({ maxTestBudgetCents: 2500 }),
    })
  )
  assert(result.status === "NOT_EXECUTABLE", "a BLOCKED fresh guardrail result is never executable")
  assert(hasReason(result, "GUARDRAIL_BLOCKED"), "correct reason code for a BLOCKED guardrail result")
}

console.log("\n=== CASE 7: Approved + INSUFFICIENT_CONFIGURATION -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ currentGuardrails: guardrails({ authorityMode: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "an incomplete guardrail configuration is never executable")
  assert(hasReason(result, "GUARDRAIL_INCOMPLETE"), "correct reason code for incomplete guardrail configuration")
}

console.log("\n=== CASE 8: Missing proposed spend -> NOT_EXECUTABLE (the critical money rule) ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ proposedSpendCents: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "null proposed spend is never executable")
  assert(hasReason(result, "MISSING_PROPOSED_SPEND"), "correct reason code for missing proposed spend")
}

console.log("\n=== CASE 9: Zero spend -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ proposedSpendCents: 0, proposedCurrency: "USD" }) }))
  assert(result.status === "NOT_EXECUTABLE", "zero spend is never executable")
  assert(hasReason(result, "INVALID_PROPOSED_SPEND"), "correct reason code for zero spend")
}

console.log("\n=== CASE 10: Negative spend -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ proposedSpendCents: -100, proposedCurrency: "USD" }) }))
  assert(result.status === "NOT_EXECUTABLE", "negative spend is never executable")
  assert(hasReason(result, "INVALID_PROPOSED_SPEND"), "correct reason code for negative spend")
}

console.log("\n=== CASE 11: Spend above maximum -> NOT_EXECUTABLE, never clamped ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ proposedSpendCents: 3000, maxAuthorizedSpendCents: 2500, proposedCurrency: "USD" }) })
  )
  assert(result.status === "NOT_EXECUTABLE", "spend exceeding the authorized maximum is never executable")
  assert(hasReason(result, "SPEND_EXCEEDS_AUTHORIZED_MAXIMUM"), "correct reason code for exceeding the authorized maximum")
}

console.log("\n=== CASE 12: Missing currency -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ proposedSpendCents: 1000, proposedCurrency: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "missing currency is never executable")
  assert(hasReason(result, "MISSING_CURRENCY"), "correct reason code for missing currency")
}

console.log("\n=== CASE 13: Currency mismatch -> NOT_EXECUTABLE, no FX conversion ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ proposedSpendCents: 1000, proposedCurrency: "EUR" }), currentGuardrails: guardrails({ currency: "USD" }) })
  )
  assert(result.status === "NOT_EXECUTABLE", "a currency mismatch is never executable")
  assert(hasReason(result, "CURRENCY_MISMATCH"), "correct reason code for currency mismatch")
}

console.log("\n=== CASE 14: Missing/mismatched Meta account -> NOT_EXECUTABLE ===")
{
  const resultMissing = evaluateExecutionEligibility(input({ currentMetaAdAccountId: null }))
  const resultMismatch = evaluateExecutionEligibility(input({ currentMetaAdAccountId: "act_DIFFERENT" }))
  assert(resultMissing.status === "NOT_EXECUTABLE" && hasReason(resultMissing, "MISSING_META_ACCOUNT"), "no live Meta account -> NOT_EXECUTABLE")
  assert(resultMismatch.status === "NOT_EXECUTABLE" && hasReason(resultMismatch, "MISSING_META_ACCOUNT"), "a mismatched live Meta account -> NOT_EXECUTABLE")
}

console.log("\n=== CASE 15: Missing target entity -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ targetMetaEntityId: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "a missing exact target is never executable")
  assert(hasReason(result, "MISSING_TARGET_ENTITY"), "correct reason code for missing target entity")
}

console.log("\n=== CASE 16: Missing required creative asset -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ creativeAssetId: null }) }))
  assert(result.status === "NOT_EXECUTABLE", "a missing required creative asset is never executable")
  assert(hasReason(result, "MISSING_CREATIVE_ASSET"), "correct reason code for missing creative asset")
}

console.log("\n=== CASE 17: Unsupported capability -> NOT_EXECUTABLE ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ solutionCandidateCode: "SOME_FUTURE_CANDIDATE", category: "EXPERIMENT" }) }))
  assert(result.status === "NOT_EXECUTABLE", "an unrecognized capability is never executable")
  assert(hasReason(result, "UNSUPPORTED_EXECUTION_CAPABILITY"), "correct reason code for unsupported capability")
}

console.log("\n=== CASE 18: OBSERVE_MORE_DATA never executable ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ solutionCandidateCode: "OBSERVE_MORE_DATA", category: "OBSERVATION" }) })
  )
  assert(result.status === "NOT_EXECUTABLE", "OBSERVE_MORE_DATA is never executable")
  assert(hasReason(result, "INFORMATION_ONLY"), "correct reason code: information-only, never an action")
}
console.log("=== CASE 19: Maximum authorized budget never becomes proposed spend (forged-equal-to-ceiling proof) ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ proposedSpendCents: null, maxAuthorizedSpendCents: 2500 }) })
  )
  assert(hasReason(result, "MISSING_PROPOSED_SPEND"), "a real ceiling never substitutes for an actual proposed spend - MISSING_PROPOSED_SPEND still fires even with a ceiling present")
}

console.log("\n=== CASE 20: Multiple blockers returned together, not just the first ===")
{
  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({ proposedSpendCents: null, proposedCurrency: null, targetMetaEntityId: null, creativeAssetId: null }),
      currentMetaAdAccountId: null,
    })
  )
  assert(result.status === "NOT_EXECUTABLE", "multiple simultaneous blockers still resolve to NOT_EXECUTABLE")
  assert(result.reasons.length >= 4, `multiple distinct blockers are all returned together, not just the first (got ${result.reasons.length})`)
  assert(hasReason(result, "MISSING_PROPOSED_SPEND") && hasReason(result, "MISSING_CURRENCY") && hasReason(result, "MISSING_TARGET_ENTITY") && hasReason(result, "MISSING_CREATIVE_ASSET") && hasReason(result, "MISSING_META_ACCOUNT"), "all five genuinely distinct blockers are present simultaneously")
}

console.log("\n=== POSITIVE CONTROL: A hypothetical, fully concrete, safe proposal correctly evaluates EXECUTABLE ===")
{
  const fullyConcreteProposal = proposal({
    proposedSpendCents: 2000,
    maxAuthorizedSpendCents: 2500,
    proposedCurrency: "USD",
    targetMetaEntityId: "adset_hypothetical_999",
    creativeAssetId: "asset_hypothetical_888",
  })
  const result = evaluateExecutionEligibility(
    input({ proposal: fullyConcreteProposal, currentGuardrails: guardrails({ currency: "USD" }), currentMetaAdAccountId: "act_123" })
  )
  assert(result.status === "EXECUTABLE", `a fully concrete, safe, hypothetical proposal correctly evaluates EXECUTABLE, proving the gate is not hardcoded to always reject (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  assert(result.reasons.length === 0, "an EXECUTABLE result carries zero blocking reasons")
}

console.log("\n=== ADVERSARIAL 1: Approved status with missing provenance cannot be papered over by otherwise-complete fields ===")
{
  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({
        decidedBy: null,
        proposedSpendCents: 2000, proposedCurrency: "USD",
        targetMetaEntityId: "adset_1", creativeAssetId: "asset_1",
      }),
    })
  )
  assert(result.status === "NOT_EXECUTABLE", "missing provenance blocks execution even when every other field is otherwise complete")
  assert(hasReason(result, "INVALID_APPROVAL_PROVENANCE"), "correct reason code fires regardless of other field completeness")
}

console.log("\n=== ADVERSARIAL 2: A forged client-supplied spend cannot be exploited (structural proof - input is trusted-fetched, not client fields) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/executionGate.ts"), "utf-8")
  assert(!source.toLowerCase().includes("req.body") && !source.toLowerCase().includes("searchparams"), "the pure gate function has no notion of client request bodies at all - it only evaluates the input object it's given")
}

console.log("\n=== ADVERSARIAL 3: Cross-brand Meta account cannot pass the binding check ===")
{
  const result = evaluateExecutionEligibility(input({ proposal: proposal({ entityId: "act_brandA" }), currentMetaAdAccountId: "act_brandB" }))
  assert(result.status === "NOT_EXECUTABLE" && hasReason(result, "MISSING_META_ACCOUNT"), "a live account belonging to a different brand's connection never satisfies this proposal's own captured account")
}

console.log("\n=== ADVERSARIAL 4: Mismatched currency between proposal and current guardrails is never silently reconciled ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ proposedSpendCents: 1000, proposedCurrency: "GBP" }), currentGuardrails: guardrails({ currency: "USD" }) })
  )
  assert(hasReason(result, "CURRENCY_MISMATCH"), "GBP proposed vs USD configured never silently passes as equivalent")
}

console.log("\n=== ADVERSARIAL 5: Ceiling lower than spend still blocks, even with everything else concrete ===")
{
  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({
        proposedSpendCents: 3000, maxAuthorizedSpendCents: 2000, proposedCurrency: "USD",
        targetMetaEntityId: "adset_1", creativeAssetId: "asset_1",
      }),
    })
  )
  assert(result.status === "NOT_EXECUTABLE" && hasReason(result, "SPEND_EXCEEDS_AUTHORIZED_MAXIMUM"), "a lower ceiling than the proposed spend blocks execution even when every other field is concrete")
}

console.log("\n=== ADVERSARIAL 6: Null ceiling blocks execution even with a valid proposed spend ===")
{
  const result = evaluateExecutionEligibility(
    input({ proposal: proposal({ proposedSpendCents: 1000, maxAuthorizedSpendCents: null, proposedCurrency: "USD" }) })
  )
  assert(result.status === "NOT_EXECUTABLE" && hasReason(result, "MISSING_MAXIMUM_AUTHORIZATION"), "a null ceiling blocks execution even when a valid spend amount exists")
}

console.log("\n=== ADVERSARIAL 7: Information-only candidate cannot be forced into an execution contract by any other field ===")
{
  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({
        solutionCandidateCode: "OBSERVE_MORE_DATA", category: "OBSERVATION",
        proposedSpendCents: 2000, proposedCurrency: "USD",
        targetMetaEntityId: "adset_1", creativeAssetId: "asset_1",
      }),
    })
  )
  assert(result.status === "NOT_EXECUTABLE" && hasReason(result, "INFORMATION_ONLY"), "an OBSERVATION-category candidate short-circuits to INFORMATION_ONLY regardless of how complete every other field is")
}

console.log("\n=== ADVERSARIAL 8: Unknown future action type never silently becomes executable ===")
{
  const result = evaluateExecutionEligibility(
    input({
      proposal: proposal({
        solutionCandidateCode: "SOME_BRAND_NEW_ACTION_TYPE", category: "EXPERIMENT",
        proposedSpendCents: 2000, proposedCurrency: "USD",
        targetMetaEntityId: "adset_1", creativeAssetId: "asset_1",
      }),
    })
  )
  assert(result.status === "NOT_EXECUTABLE" && hasReason(result, "UNSUPPORTED_EXECUTION_CAPABILITY"), "a genuinely new, unregistered action type never becomes executable merely because every other field happens to be populated")
}

console.log("\n=== STRUCTURAL: No Meta/AI/execution/generation primitive exists anywhere in this module ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/executionGate.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "anthropic", "openai", "executeaction", "applychange", "publish", "removebg", "remove.bg"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `zero execution/AI/Meta/generation/publication primitives exist in this module (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== STRUCTURAL: This module is read-only - it never imports any mutation/write repository function ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/executionGate.ts"), "utf-8")
  assert(!source.includes("insertActionProposal") && !source.includes("decideActionProposal") && !source.includes("expireActionProposal"), "the gate never imports any repository write function - it is a pure function of its inputs only")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }