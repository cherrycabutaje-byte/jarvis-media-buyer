import { evaluateCreativeTestStrategyReadiness, type CreativeTestStrategyInput } from "@/lib/product/creativeTestStrategy"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function input(overrides: Partial<CreativeTestStrategyInput> = {}): CreativeTestStrategyInput {
  return {
    strategy: "META_CREATIVE_TEST",
    proposedSpendCents: 1500,
    maxAuthorizedSpendCents: 2500,
    configuredMetaBudgetCents: 1500,
    currency: "USD",
    startTime: "2026-09-10T00:00:00.000Z",
    endTime: "2026-09-17T00:00:00.000Z",
    sourceCampaignId: "camp_1",
    sourceAdSetId: "adset_1",
    sourceAdId: "ad_1",
    metaBusinessId: "biz_1",
    authorizationScopeCovers: true,
    sourceAdSetConfigurationCaptured: true,
    ...overrides,
  }
}
function hasReason(result: ReturnType<typeof evaluateCreativeTestStrategyReadiness>, code: string): boolean {
  return result.reasons.some((r) => r.code === code)
}

console.log("=== INVARIANT 1: Proposed spend != maximum authorization (conceptually distinct, never conflated) ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ proposedSpendCents: 1500, maxAuthorizedSpendCents: 2500 }))
  assert(!hasReason(result, "SPEND_EXCEEDS_AUTHORIZED_MAXIMUM"), "a proposed spend genuinely below the maximum is accepted as its own distinct value, never silently replaced by the maximum")
  const result2 = evaluateCreativeTestStrategyReadiness(input({ proposedSpendCents: 1500, maxAuthorizedSpendCents: null }))
  assert(hasReason(result2, "MISSING_MAXIMUM_AUTHORIZATION") && !hasReason(result2, "MISSING_PROPOSED_SPEND"), "a present proposed spend and an absent maximum are tracked as two independent facts, not inferred from one another")
}

console.log("\n=== INVARIANT 2: Existing Ad Set insertion can never be labeled spend-isolated (permanent, structural) ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ strategy: "AD_SET_INSERTION" }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "SPEND_MODEL_UNSUPPORTED"), "AD_SET_INSERTION is permanently non-viable regardless of any other field - no amount of additional data changes Meta's own delivery/auction semantics")
}

console.log("\n=== INVARIANT 3: Unsupported strategy fails closed ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ strategy: "UNSUPPORTED" }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "UNSUPPORTED_STRATEGY"), "an unsupported strategy value fails closed immediately")
}

console.log("\n=== INVARIANT 4: Missing source Ad Set configuration fails closed for DEDICATED_TEST_AD_SET ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ strategy: "DEDICATED_TEST_AD_SET", sourceAdSetConfigurationCaptured: false }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "SOURCE_AD_SET_CONFIGURATION_INSUFFICIENT"), "DEDICATED_TEST_AD_SET fails closed without genuinely captured source configuration - confirmed absent in the real read provider today")
}

console.log("\n=== INVARIANT 5: Missing budget semantics (configured Meta budget) fails closed for META_CREATIVE_TEST ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ configuredMetaBudgetCents: null }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "MISSING_CONFIGURED_META_BUDGET"), "a missing concrete Meta-side budget value fails closed for the Creative Test strategy")
}

console.log("\n=== INVARIANT 6: No execution plan becomes ready without a selected safe strategy AND full authorization coverage ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ authorizationScopeCovers: false }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "AUTHORIZATION_SCOPE_INSUFFICIENT"), "even a fully-configured META_CREATIVE_TEST strategy remains NOT_VIABLE if the owner has never been asked to authorize its specific new side effects - confirmed genuine gap in the current authorization scope")
}

console.log("\n=== CASE: Missing Meta Business ID fails closed for META_CREATIVE_TEST (confirmed nullable in the live schema) ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input({ metaBusinessId: null }))
  assert(result.status === "STRATEGY_NOT_VIABLE" && hasReason(result, "MISSING_META_BUSINESS_ID"), "a missing Meta Business ID fails closed, since ad_studies requires it and the column is confirmed nullable with no population guarantee")
}

console.log("\n=== CASE: Missing source ad, schedule, or currency each fail closed independently ===")
{
  assert(hasReason(evaluateCreativeTestStrategyReadiness(input({ sourceAdId: null })), "MISSING_SOURCE_AD"), "missing source ad fails closed")
  assert(hasReason(evaluateCreativeTestStrategyReadiness(input({ startTime: null })), "MISSING_SCHEDULE"), "missing start time fails closed")
  assert(hasReason(evaluateCreativeTestStrategyReadiness(input({ currency: null })), "MISSING_CURRENCY"), "missing currency fails closed")
}

console.log("\n=== POSITIVE CONTROL: A hypothetical, fully-resolved fixture (in-memory only) evaluates STRATEGY_VIABLE, proving the evaluator is not hardcoded to always reject ===")
{
  const result = evaluateCreativeTestStrategyReadiness(input())
  assert(result.status === "STRATEGY_VIABLE", `a fully concrete, hypothetical fixture with every gap resolved evaluates STRATEGY_VIABLE (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  assert(result.reasons.length === 0, "a STRATEGY_VIABLE result carries zero blocking reasons")
}

console.log("\n=== DETERMINISM: Identical input always produces byte-identical output ===")
{
  const a = evaluateCreativeTestStrategyReadiness(input())
  const b = evaluateCreativeTestStrategyReadiness(input())
  assert(JSON.stringify(a) === JSON.stringify(b), "calling the evaluator twice on identical input produces identical results")
}

console.log("\n=== STRUCTURAL: No Meta write, provider-contract, persistence, or execution primitive exists in this module (executable code only, excluding the doc comment that documents the investigated endpoint) ===")
{
  const rawSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/creativeTestStrategy.ts"), "utf-8")
  const source = rawSource.replace(/\/\*\*[\s\S]*?\*\//g, "").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "createclient", "supabase", "createad(", "createadset(", "createcampaign(", "ad_studies"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `zero Meta-write/persistence/execution primitives exist in this pure module's executable code (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== STRUCTURAL: No new Meta write provider implementation or mutation primitive was introduced anywhere in this slice (executable code only, excluding the frozen doc comment explaining their deliberate absence) ===")
{
  const writeProviderRaw = fs.readFileSync(path.join(process.cwd(), "src/lib/product/providers/metaAdsWriteProvider.ts"), "utf-8")
  const writeProviderCode = writeProviderRaw.replace(/\/\*\*[\s\S]*?\*\//g, "").toLowerCase()
  assert(
    !/createadset\s*\(/.test(writeProviderCode) && !/createcampaign\s*\(/.test(writeProviderCode) && !writeProviderCode.includes("ad_studies"),
    "the existing write-provider contract declares no ad-set/campaign/ad_study creation methods in its executable code - it remains exactly as frozen"
  )
}

console.log("\n=== STRUCTURAL: No active-status creation path exists anywhere in this slice ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/creativeTestStrategy.ts"), "utf-8")
  assert(!source.toLowerCase().includes('"active"') && !source.toLowerCase().includes("status: \"active\""), "no active/live-delivery status value is ever produced by this module - it is a pure readiness evaluator only")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }