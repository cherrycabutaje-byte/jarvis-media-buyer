import { validateConcreteAuthorization, evaluateAuthorizedSpecificationExecutionEligibility, type AuthorizedSpecificationInput } from "@/lib/product/concreteActionSpecification"
import type { OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

console.log("=== CASE 1: READY + AUTHORIZE -> AUTHORIZED ===")
{
  const result = validateConcreteAuthorization("READY_FOR_OWNER_AUTHORIZATION", "AUTHORIZE")
  assert(result.valid === true && result.resultingStatus === "AUTHORIZED", `READY + AUTHORIZE resolves to AUTHORIZED (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 2: READY + DECLINE -> DECLINED ===")
{
  const result = validateConcreteAuthorization("READY_FOR_OWNER_AUTHORIZATION", "DECLINE")
  assert(result.valid === true && result.resultingStatus === "DECLINED", `READY + DECLINE resolves to DECLINED (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 3: DRAFT + AUTHORIZE rejected ===")
{
  const result = validateConcreteAuthorization("DRAFT", "AUTHORIZE")
  assert(result.valid === false, "a DRAFT cannot be authorized - it must first reach READY")
}

console.log("\n=== CASE 4: DRAFT + DECLINE rejected ===")
{
  const result = validateConcreteAuthorization("DRAFT", "DECLINE")
  assert(result.valid === false, "a DRAFT cannot be declined either")
}

console.log("\n=== CASE 5: AUTHORIZED + AUTHORIZE rejected (no reauthorization) ===")
{
  const result = validateConcreteAuthorization("AUTHORIZED", "AUTHORIZE")
  assert(result.valid === false, "an already-AUTHORIZED specification cannot be authorized again")
}

console.log("\n=== CASE 6: AUTHORIZED + DECLINE rejected (no decision reversal) ===")
{
  const result = validateConcreteAuthorization("AUTHORIZED", "DECLINE")
  assert(result.valid === false, "an already-AUTHORIZED specification cannot be declined after the fact")
}

console.log("\n=== CASE 7: DECLINED + AUTHORIZE rejected ===")
{
  const result = validateConcreteAuthorization("DECLINED", "AUTHORIZE")
  assert(result.valid === false, "an already-DECLINED specification cannot be authorized after the fact")
}

console.log("\n=== CASE 8: DECLINED + DECLINE rejected ===")
{
  const result = validateConcreteAuthorization("DECLINED", "DECLINE")
  assert(result.valid === false, "an already-DECLINED specification cannot be declined again")
}

console.log("\n=== CASE 9: SUPERSEDED + AUTHORIZE rejected ===")
{
  const result = validateConcreteAuthorization("SUPERSEDED", "AUTHORIZE")
  assert(result.valid === false, "a SUPERSEDED specification can never be authorized")
}

console.log("\n=== CASES 10-21 + POSITIVE CONTROL: Execution-gate bridge revalidation ===")
{
  function guardrails(overrides: Partial<OwnerGuardrails> = {}): OwnerGuardrails {
    return { authorityMode: "ADVISOR", currency: "USD", monthlyBudgetCents: 100000, dailyMaximumCents: 5000, maxTestBudgetCents: 2500, ...overrides }
  }
  function spec(overrides: Partial<AuthorizedSpecificationInput> = {}): AuthorizedSpecificationInput {
    return {
      status: "AUTHORIZED", decidedAt: "2026-08-30T00:00:00.000Z", decidedBy: "user_1",
      actionType: "TEST_ALTERNATIVE_CREATIVE", metaAdAccountId: "act_123",
      targetEntityType: "AD_SET", targetEntityId: "adset_1", creativeAssetId: "asset_1",
      proposedSpendCents: 1500, currency: "USD",
      ...overrides,
    }
  }
  function proposal(overrides: Partial<Parameters<typeof evaluateAuthorizedSpecificationExecutionEligibility>[1]> = {}) {
    return {
      status: "APPROVED" as const, solutionCandidateCode: "TEST_ALTERNATIVE_CREATIVE", category: "EXPERIMENT",
      createdAt: "2026-08-29T00:00:00.000Z", decidedAt: "2026-08-29T01:00:00.000Z", decidedBy: "user_1",
      entityType: "ACCOUNT", entityId: "act_123", maxAuthorizedSpendCents: 2500,
      ...overrides,
    }
  }

  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ decidedBy: null }), proposal(), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "INVALID_AUTHORIZATION_PROVENANCE"), "missing decidedBy on the specification's own authorization fails closed")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ proposedSpendCents: 999999 }), proposal(), guardrails({ maxTestBudgetCents: 2500 }), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "GUARDRAIL_BLOCKED"), "a BLOCKED current guardrail prevents eligibility even after authorization")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec(), proposal(), guardrails({ authorityMode: null }), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "GUARDRAIL_INCOMPLETE"), "an incomplete current guardrail configuration prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec(), proposal(), guardrails(), "act_DIFFERENT")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "MISSING_META_ACCOUNT"), "a drifted Meta account prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ targetEntityId: null }), proposal(), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "MISSING_TARGET_ENTITY"), "a missing target prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ targetEntityId: null, targetEntityType: null }), proposal(), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE", "an invalid/absent target never becomes eligible")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ creativeAssetId: null }), proposal(), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "MISSING_CREATIVE_ASSET"), "a missing creative prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ proposedSpendCents: 0 }), proposal(), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "INVALID_PROPOSED_SPEND"), "zero/invalid spend prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ proposedSpendCents: 3000 }), proposal({ maxAuthorizedSpendCents: 2500 }), guardrails(), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "SPEND_EXCEEDS_AUTHORIZED_MAXIMUM"), "spend exceeding the current maximum prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ currency: "EUR" }), proposal(), guardrails({ currency: "USD" }), "act_123")
    assert(result.status === "NOT_EXECUTABLE" && result.reasons.some((r) => r.code === "CURRENCY_MISMATCH"), "a currency mismatch prevents eligibility")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec({ proposedSpendCents: null }), proposal({ maxAuthorizedSpendCents: 2500 }), guardrails(), "act_123")
    assert(result.reasons.some((r) => r.code === "MISSING_PROPOSED_SPEND"), "a real ceiling never substitutes for an actual proposed spend, even post-authorization")
  }
  {
    const result = evaluateAuthorizedSpecificationExecutionEligibility(spec(), proposal(), guardrails(), "act_123")
    assert(result.status === "EXECUTABLE", `a fully concrete, authorized, safe fixture evaluates EXECUTABLE (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  }
}

console.log("\n=== CASE 22: DECLINE remains possible even when authorization safety validation would fail (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionSpecificationActions.ts"), "utf-8")
  const fnStart = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const declineIdx = actionSource.indexOf('decision === "DECLINE"', fnStart)
  const firstRevalidationIdx = actionSource.indexOf("getMetaAdAccountLinkForBrand(brandId)", fnStart)
  assert(declineIdx > fnStart && declineIdx < firstRevalidationIdx, "DECLINE is handled and returns BEFORE the full revalidation gauntlet (guardrail/account/target/creative checks) even runs - it remains possible when those checks would otherwise fail")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }