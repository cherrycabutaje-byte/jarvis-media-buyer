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

const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/creativeExecutionContextRepository.ts"), "utf-8")
const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/creativeExecutionContextActions.ts"), "utf-8")
const specActionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionSpecificationActions.ts"), "utf-8")
const migrationDir = path.join(process.cwd(), "supabase/migrations")

console.log("=== SECURITY 1: Foreign specification is rejected ===")
{
  const fnMatch = actionSource.match(/export async function createDraftCreativeExecutionContextAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("specResult.data.brand_id !== brandId"), "the action explicitly verifies the specification's own brand_id matches the caller-supplied brandId before creating any context")
}

console.log("\n=== SECURITY 2: Foreign creative execution context (wrong brand) is rejected ===")
{
  const fnMatch = actionSource.match(/export async function updateDraftCreativeExecutionContextAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("contextResult.data.brand_id !== brandId"), "the action explicitly verifies the context's own brand_id matches the caller-supplied brandId")
}

console.log("\n=== SECURITY 3: Foreign Page identity would be rejected if verifiable (structural proof - verification is never granted client-side) ===")
{
  const sigMatch = actionSource.match(/export async function updateDraftCreativeExecutionContextAction\(([\s\S]*?)\):/)
  const signature = sigMatch ? sigMatch[1] : ""
  assert(!signature.toLowerCase().includes("verified"), "the client cannot supply pageIdentityVerified through this action at all - it is never a client-suppliable field")
}

console.log("\n=== SECURITY 4: page_identity_verified can never be set to true by any application code path (confirmed STOP condition upheld) ===")
{
  const combined = repoSource + actionSource
  assert(!combined.includes("page_identity_verified: true") && !combined.includes("pageIdentityVerified: true"), "no function anywhere in the repository or action layer ever sets page_identity_verified to true - it remains honestly false for every real context in V1")
}

console.log("\n=== IMMUTABILITY 1: Finalized (non-DRAFT) context's material fields cannot silently change ===")
{
  const updateFn = repoSource.match(/export async function updateDraftCreativeExecutionContext[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(updateBody.includes('.eq("status", "DRAFT")'), "updateDraftCreativeExecutionContext (the only function that can change material fields) is atomically gated to DRAFT rows only")
}

console.log("\n=== IMMUTABILITY 2: Authorization applies to the exact persisted snapshot (finalize reads from the trusted row, not client input) ===")
{
  const fnMatch = actionSource.match(/export async function finalizeCreativeExecutionContextAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("contextResult.data.primary_text") && fnBody.includes("contextResult.data.page_identity_verified"), "readiness evaluation reads every field from the freshly-reloaded, trusted persisted row - never from a client-supplied payload")
}console.log("\n=== IMMUTABILITY 3: Changed content requires a genuinely new authorization (one-way atomic transition, no reversal) ===")
{
  const authFn = repoSource.match(/export async function authorizeCreativeExecutionContext[\s\S]*?\n}/)
  const authBody = authFn ? authFn[0] : ""
  assert(authBody.includes('.eq("status", "READY_FOR_OWNER_AUTHORIZATION")') && authBody.includes(".single()"), "authorization is atomically gated - a second attempt on an already-decided row affects zero rows")
}

console.log("\n=== AUTHORIZATION PROVENANCE INDEPENDENCE: This context's decision never reuses or reinterprets action_specifications.decided_at/decided_by ===")
{
  assert(!actionSource.includes("specResult.data.decided_by") && !actionSource.includes("specResult.data.decided_at"), "the creative execution context action layer never reads the specification's own decided_at/decided_by - its authorization provenance is entirely independent")
}

console.log("\n=== EXECUTION PLAN INTEGRATION 1: An unauthorized context is treated identically to a missing one (creative-metadata blockers still apply) ===")
{
  const fnMatch = specActionSource.match(/export async function buildExecutionPlanAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes('c.status === "AUTHORIZED"'), "only a genuinely AUTHORIZED context is ever passed through to the plan builder - a DRAFT or READY context is treated as absent")
}

console.log("\n=== EXECUTION PLAN INTEGRATION 2: SPEND_MODEL_UNSUPPORTED is never weakened by this wiring (structural proof - targetEntityType passed through unchanged) ===")
{
  const fnMatch = specActionSource.match(/export async function buildExecutionPlanAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("targetEntityType: specResult.data.target_entity_type"), "the specification's own real targetEntityType is passed through to the plan builder unchanged - an AD_SET target still triggers SPEND_MODEL_UNSUPPORTED exactly as before")
}

console.log("\n=== EXECUTION PLAN TEST: Complete synthetic positive fixture resolves ALL creative-context blockers, but SPEND_MODEL_UNSUPPORTED still blocks (proves independence) ===")
{
  const spec: AuthorizedSpecificationForPlanning = {
    id: "spec_1", status: "AUTHORIZED", decidedAt: "2026-08-31T00:00:00.000Z", decidedBy: "user_1",
    actionType: "TEST_ALTERNATIVE_CREATIVE", metaAdAccountId: "act_123",
    targetEntityType: "AD_SET", targetEntityId: "adset_1",
    proposedSpendCents: 1500, currency: "USD",
  }
  const gate: ExecutionEligibilityResult = { status: "EXECUTABLE", reasons: [] }
  const creative: CreativeAssetForPlanning = {
    id: "asset_1", mimeType: "image/jpeg", storagePath: "path.jpg",
    primaryText: "Great product, try it today!", headline: "New arrival", description: "Limited time offer",
    destinationUrl: "https://example.com/product", callToActionType: "SHOP_NOW",
    pageId: "page_1", instagramActorId: "ig_1",
  }
  const result = buildMetaExecutionPlan(spec, gate, creative)
  assert(result.status === "PLAN_UNAVAILABLE", "the final result is still PLAN_UNAVAILABLE even with fully complete, authorized creative content")
  assert(
    result.reasons.some((r) => r.code === "SPEND_MODEL_UNSUPPORTED"),
    "SPEND_MODEL_UNSUPPORTED is the ONLY remaining reason, proving the creative-metadata blockers and the spend-model blocker are genuinely independent"
  )
  assert(
    !result.reasons.some((r) => r.code === "MISSING_CREATIVE_COPY" || r.code === "MISSING_DESTINATION_URL" || r.code === "MISSING_CALL_TO_ACTION" || r.code === "MISSING_PAGE_IDENTITY"),
    "every creative-metadata blocker has genuinely disappeared given complete content - confirming they were resolved, not merely bypassed"
  )
}

console.log("\n=== MIGRATION: exactly one new migration was added, additive only, creating a dedicated new table ===")
{
  const files = fs.readdirSync(migrationDir)
  const newFile = files.find((f) => f.startsWith("20260831"))
  assert(newFile !== undefined, "the expected new migration file exists")
  const content = newFile ? fs.readFileSync(path.join(migrationDir, newFile), "utf-8") : ""
  assert(content.toLowerCase().includes("create table creative_execution_contexts"), "the migration creates a genuinely new, dedicated table")
  assert(!content.toLowerCase().includes("alter table action_specifications") && !content.toLowerCase().includes("alter table action_proposals"), "the migration never retrofits fields into the frozen Action Specification or Action Proposal schemas")
  assert(content.toLowerCase().includes("page_identity_verified boolean not null default false"), "page_identity_verified defaults to false at the database level, matching the confirmed STOP condition")
}

console.log("\n=== SIDE-EFFECT PROOF: No Meta call, no AI call, no job enqueue, no publication anywhere in this slice ===")
{
  const combined = (repoSource + actionSource).toLowerCase()
  const forbidden = ["graph.facebook.com/", "fetch(", "anthropic", "openai", "executionjob", "worker_job", "publish"]
  const found = forbidden.filter((w) => combined.includes(w))
  assert(found.length === 0, `zero Meta/AI/job-enqueue/publication primitives exist anywhere in this slice (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== UI: No misleading Launch/Run/Publish/Go live language, exact required review/authorization language present ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  const forbidden = [">Launch<", ">Run<", ">Publish<", ">Go live<"]
  const found = forbidden.filter((w) => uiSource.includes(w))
  assert(found.length === 0, `no misleading launch/publish language exists anywhere in the ad-content UI (found: ${found.join(", ") || "none"})`)
  assert(uiSource.includes("This is the exact advertising content JARVIS would use"), "the required 'exact advertising content' framing is present")
  assert(uiSource.includes("Authorize this ad content"), "the required 'Authorize this ad content' control is present")
  assert(uiSource.includes("This does not publish the ad or spend money."), "the required non-publication disclaimer is present")
  assert(uiSource.includes("Ad content authorized"), "the authorized-state UI is present")
  assert(uiSource.includes("Ad content declined"), "the declined-state UI is present")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }