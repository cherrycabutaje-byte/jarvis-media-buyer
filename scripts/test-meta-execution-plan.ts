import { buildMetaExecutionPlan, type AuthorizedSpecificationForPlanning, type CreativeAssetForPlanning } from "@/lib/product/metaExecutionPlan"
import type { ExecutionEligibilityResult } from "@/lib/product/executionGate"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function spec(overrides: Partial<AuthorizedSpecificationForPlanning> = {}): AuthorizedSpecificationForPlanning {
  return {
    id: "spec_1", status: "AUTHORIZED", decidedAt: "2026-08-31T00:00:00.000Z", decidedBy: "user_1",
    actionType: "TEST_ALTERNATIVE_CREATIVE", metaAdAccountId: "act_123",
    targetEntityType: "AD_SET", targetEntityId: "adset_1",
    proposedSpendCents: 1500, currency: "USD",
    ...overrides,
  }
}
function executableGate(): ExecutionEligibilityResult {
  return { status: "EXECUTABLE", reasons: [] }
}
function notExecutableGate(): ExecutionEligibilityResult {
  return { status: "NOT_EXECUTABLE", reasons: [{ code: "SOME_REASON", message: "not eligible" }] }
}
function creative(overrides: Partial<CreativeAssetForPlanning> = {}): CreativeAssetForPlanning {
  return {
    id: "asset_1", mimeType: "image/jpeg", storagePath: "path/to/asset.jpg",
    primaryText: null, headline: null, description: null,
    destinationUrl: null, callToActionType: null, pageId: null, instagramActorId: null,
    ...overrides,
  }
}
function hasReason(result: ReturnType<typeof buildMetaExecutionPlan>, code: string): boolean {
  return result.reasons.some((r) => r.code === code)
}

console.log("=== CASE 1: Non-authorized specification -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec({ status: "READY_FOR_OWNER_AUTHORIZATION" }), executableGate(), creative())
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "SPECIFICATION_NOT_AUTHORIZED"), "a non-authorized specification never produces a plan")
}

console.log("\n=== CASE 2: Non-executable gate result -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec(), notExecutableGate(), creative())
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "GATE_NOT_EXECUTABLE"), "a NOT_EXECUTABLE gate result never produces a plan")
}

console.log("\n=== CASE 3: Unsupported action -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec({ actionType: "SOME_OTHER_ACTION" }), executableGate(), creative())
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "UNSUPPORTED_ACTION"), "an unsupported action type never produces a plan")
}

console.log("\n=== CASE 4: Missing authorization provenance -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec({ decidedBy: null }), executableGate(), creative())
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "INVALID_AUTHORIZATION_PROVENANCE"), "missing authorization provenance never produces a plan")
}

console.log("\n=== CASE 5: AD_SET target -> spend-model mismatch -> PLAN_UNAVAILABLE (STOP-level finding) ===")
{
  const result = buildMetaExecutionPlan(
    spec(),
    executableGate(),
    creative({ primaryText: "Great product", destinationUrl: "https://example.com", callToActionType: "SHOP_NOW", pageId: "page_1" })
  )
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "SPEND_MODEL_UNSUPPORTED"), "targeting an existing AD_SET always triggers the spend-model mismatch finding, even with otherwise-complete creative data")
}

console.log("\n=== CASE 6: Missing required creative metadata (null creative) -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec(), executableGate(), null)
  assert(result.status === "PLAN_UNAVAILABLE" && hasReason(result, "MISSING_CREATIVE_METADATA"), "a missing creative fails closed")
}

console.log("\n=== CASE 7: Missing copy/destination/CTA/page identity -> PLAN_UNAVAILABLE ===")
{
  const result = buildMetaExecutionPlan(spec({ targetEntityType: null }), executableGate(), creative())
  assert(result.status === "PLAN_UNAVAILABLE", "missing copy/destination/CTA/page identity fails closed")
  assert(hasReason(result, "MISSING_CREATIVE_COPY"), "missing primary text is reported")
  assert(hasReason(result, "MISSING_DESTINATION_URL"), "missing destination URL is reported")
  assert(hasReason(result, "MISSING_CALL_TO_ACTION"), "missing call-to-action is reported")
  assert(hasReason(result, "MISSING_PAGE_IDENTITY"), "missing Page identity is reported")
}

console.log("\n=== CASE 8: Complete supported fixture (non-AD_SET target) -> PLAN_READY (positive control) ===")
{
  const result = buildMetaExecutionPlan(
    spec({ targetEntityType: "SOME_FUTURE_DEDICATED_TARGET_TYPE" }),
    executableGate(),
    creative({ primaryText: "Great product", destinationUrl: "https://example.com", callToActionType: "SHOP_NOW", pageId: "page_1" })
  )
  assert(result.status === "PLAN_READY", `a fully concrete, safe, hypothetical fixture with a non-AD_SET target evaluates PLAN_READY, proving the builder is not hardcoded to always reject (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  assert(result.plan !== null && result.plan.operations.length === 3, "the resulting plan has exactly the three modeled operations")
  assert(result.plan!.operations[2].initialStatus === "PAUSED", "the CREATE_AD operation explicitly specifies the PAUSED initial delivery-safety state")
  assert(result.plan!.apiVersion === "v26.0", "the plan records the exact currently-configured Meta Marketing API version")
  assert(result.plan!.specificationId === "spec_1", "the plan is bound to the exact specification ID")
}

console.log("\n=== STRUCTURAL: No Meta call, no job enqueue, no asset upload, no spend mutation, no creative generation, no publication anywhere in this module ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/metaExecutionPlan.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "anthropic", "openai", "executionjob", "worker_job", "removebg", "remove.bg", "publish"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `zero execution/upload/AI/publication primitives exist in this module (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== STRUCTURAL: The provider contract file contains zero implementation, zero HTTP calls ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/product/providers/metaAdsWriteProvider.ts"), "utf-8").toLowerCase()
  const forbidden = ["fetch(", "graph.facebook.com", "axios", "http.request"]
  const found = forbidden.filter((w) => source.includes(w))
  assert(found.length === 0, `the provider contract is genuinely type-only, with zero implementation (found: ${found.join(", ") || "none"})`)
  assert(
    !/createadset\s*\(/.test(source.replace(/\/\*\*[\s\S]*?\*\//g, "")) && !/createcampaign\s*\(/.test(source.replace(/\/\*\*[\s\S]*?\*\//g, "")),
    "no budget-controlling method (createAdSet/createCampaign) is actually declared in the contract (the only textual mention is the doc comment explicitly explaining why it's excluded, which is stripped before this check) - matching the unresolved spend-model finding"
  )
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }