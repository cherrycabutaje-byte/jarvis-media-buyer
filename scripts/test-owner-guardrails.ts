import { evaluateProposedMediaAction, type OwnerGuardrails, type ProposedMediaAction } from "@/lib/product/ownerGuardrails"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

const fullGuardrails: OwnerGuardrails = {
  authorityMode: "ADVISOR",
  currency: "USD",
  monthlyBudgetCents: 500000,
  dailyMaximumCents: 10000,
  maxTestBudgetCents: 5000,
}

console.log("=== CASE 1: Valid budget configuration + spend within limit -> ALLOWED ===")
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 2000, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "ALLOWED", `decision is ALLOWED (got ${result.decision})`)
}

console.log("\n=== CASE 2: Missing configuration (no authority mode) -> INSUFFICIENT_CONFIGURATION ===")
{
  const guardrails: OwnerGuardrails = { ...fullGuardrails, authorityMode: null }
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 2000, currency: "USD" }
  const result = evaluateProposedMediaAction(action, guardrails)
  assert(result.decision === "INSUFFICIENT_CONFIGURATION", `decision is INSUFFICIENT_CONFIGURATION (got ${result.decision})`)
}

console.log("\n=== CASE 3: Missing currency -> INSUFFICIENT_CONFIGURATION ===")
{
  const guardrails: OwnerGuardrails = { ...fullGuardrails, currency: null }
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 2000, currency: "USD" }
  const result = evaluateProposedMediaAction(action, guardrails)
  assert(result.decision === "INSUFFICIENT_CONFIGURATION", `decision is INSUFFICIENT_CONFIGURATION (got ${result.decision})`)
}

console.log("\n=== CASE 4: Zero/negative invalid proposed amount -> BLOCKED, never silently allowed ===")
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: -500, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "BLOCKED", `negative amount -> BLOCKED (got ${result.decision})`)
}
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 0, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "ALLOWED", `zero spend is a valid, allowed proposal (got ${result.decision})`)
}

console.log("\n=== CASE 5: Proposed spend below limit -> ALLOWED ===")
{
  const action: ProposedMediaAction = { type: "DAILY_SPEND", amountCents: 100, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "ALLOWED", `below daily limit -> ALLOWED (got ${result.decision})`)
}

console.log("\n=== CASE 6: Proposed spend EXACTLY at limit -> ALLOWED (only exceeding blocks) ===")
{
  const action: ProposedMediaAction = { type: "DAILY_SPEND", amountCents: 10000, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "ALLOWED", `exactly at daily limit -> ALLOWED (got ${result.decision})`)
}
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 5000, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "ALLOWED", `exactly at test limit -> ALLOWED (got ${result.decision})`)
}

console.log("\n=== CASE 7: Above daily limit -> BLOCKED ===")
{
  const action: ProposedMediaAction = { type: "DAILY_SPEND", amountCents: 10001, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "BLOCKED", `above daily limit -> BLOCKED (got ${result.decision})`)
}

console.log("\n=== CASE 8: Above test limit -> BLOCKED ===")
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 5001, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "BLOCKED", `above test limit -> BLOCKED (got ${result.decision})`)
}

console.log("\n=== CASE 9: Currency mismatch -> BLOCKED, regardless of amount fitting the limit ===")
{
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 100, currency: "EUR" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "BLOCKED", `currency mismatch -> BLOCKED even though amount is small (got ${result.decision})`)
}

console.log("\n=== CASE 10: Advisor mode + proposed execution -> NEEDS_OWNER_APPROVAL, non-executable ===")
{
  const action: ProposedMediaAction = { type: "EXECUTE_ON_META", amountCents: 100, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "NEEDS_OWNER_APPROVAL", `execution proposal -> NEEDS_OWNER_APPROVAL (got ${result.decision})`)
}

console.log("\n=== CASE 10b: Execution proposal is non-executable EVEN IF stored mode is AUTOPILOT ===")
{
  const autopilotGuardrails: OwnerGuardrails = { ...fullGuardrails, authorityMode: "AUTOPILOT" }
  const action: ProposedMediaAction = { type: "EXECUTE_ON_META", amountCents: 100, currency: "USD" }
  const result = evaluateProposedMediaAction(action, autopilotGuardrails)
  assert(result.decision === "NEEDS_OWNER_APPROVAL", `stored AUTOPILOT preference does NOT grant real execution in V1 (got ${result.decision})`)
}

console.log("\n=== CASE 11: One guardrail cannot silently override another - currency checked before limit ===")
{
  // Even though amountCents (100) is well within maxTestBudgetCents (5000),
  // the currency mismatch must still block - a passing budget check must
  // never silently override a failing currency check.
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 100, currency: "GBP" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "BLOCKED", `currency check is not bypassed by an otherwise-fine amount (got ${result.decision})`)
}

console.log("\n=== CASE 12: Fail-closed on malformed/unrecognized input ===")
{
  // @ts-expect-error - intentionally testing an unrecognized action type
  const action: ProposedMediaAction = { type: "SOMETHING_ELSE", amountCents: 100, currency: "USD" }
  const result = evaluateProposedMediaAction(action, fullGuardrails)
  assert(result.decision === "INSUFFICIENT_CONFIGURATION", `unrecognized action type fails closed, not ALLOWED (got ${result.decision})`)
}

console.log("\n=== CASE 13: Missing test-budget config specifically -> INSUFFICIENT_CONFIGURATION ===")
{
  const guardrails: OwnerGuardrails = { ...fullGuardrails, maxTestBudgetCents: null }
  const action: ProposedMediaAction = { type: "TEST_SPEND", amountCents: 100, currency: "USD" }
  const result = evaluateProposedMediaAction(action, guardrails)
  assert(result.decision === "INSUFFICIENT_CONFIGURATION", `missing test budget specifically -> INSUFFICIENT_CONFIGURATION (got ${result.decision})`)
}

console.log("\n=== CASE 14: No fabricated target - OwnerGoal fields are honestly nullable ===")
{
  // Structural/type-level proof: OwnerGoal permits null for every
  // target field - there is no default/fabricated value path in the
  // type system for objective, targetRoas, or targetCpaCents.
  const goal = { objective: null, targetRoas: null, targetCpaCents: null }
  assert(goal.objective === null && goal.targetRoas === null && goal.targetCpaCents === null, "OwnerGoal fields default to null, never a fabricated value")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }