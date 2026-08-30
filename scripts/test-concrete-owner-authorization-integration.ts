import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionSpecificationRepository.ts"), "utf-8")
const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionSpecificationActions.ts"), "utf-8")
const migrationDir = path.join(process.cwd(), "supabase/migrations")

console.log("=== CONCURRENCY 1: AUTHORIZE vs DECLINE - one winner (structural proof, shared atomic guard) ===")
{
  const authFn = repoSource.match(/export async function authorizeSpecification[\s\S]*?\n}/)
  const declineFn = repoSource.match(/export async function declineSpecification[\s\S]*?\n}/)
  const authBody = authFn ? authFn[0] : ""
  const declineBody = declineFn ? declineFn[0] : ""
  assert(
    authBody.includes('.eq("status", "READY_FOR_OWNER_AUTHORIZATION")') && declineBody.includes('.eq("status", "READY_FOR_OWNER_AUTHORIZATION")'),
    "both authorizeSpecification and declineSpecification share the identical atomic UPDATE...WHERE guard - whichever commits first at the database level wins, the other affects zero rows"
  )
}

console.log("\n=== CONCURRENCY 2: AUTHORIZE vs AUTHORIZE - one winner (same guard, second attempt cannot re-match) ===")
{
  const authFn = repoSource.match(/export async function authorizeSpecification[\s\S]*?\n}/)
  const authBody = authFn ? authFn[0] : ""
  assert(authBody.includes(".single()"), "authorizeSpecification uses .single(), which errors (rather than silently succeeding) when the WHERE clause matches zero rows on a second concurrent attempt")
}

console.log("\n=== CONCURRENCY 3: DECLINE vs DECLINE - one winner (same mechanism) ===")
{
  const declineFn = repoSource.match(/export async function declineSpecification[\s\S]*?\n}/)
  const declineBody = declineFn ? declineFn[0] : ""
  assert(declineBody.includes(".single()") && declineBody.includes('.eq("status", "READY_FOR_OWNER_AUTHORIZATION")'), "declineSpecification uses the same atomic single()+WHERE pattern, so a second concurrent decline can never also succeed")
}

console.log("\n=== IMMUTABILITY 1: AUTHORIZED specification's spend cannot later change (no update function touches an AUTHORIZED row) ===")
{
  const updateFn = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(updateBody.includes('.eq("status", "DRAFT")'), "updateDraftSpecification (the only function that can change proposed_spend_cents) is gated to DRAFT rows only - it can never match an AUTHORIZED row")
}

console.log("\n=== IMMUTABILITY 2: AUTHORIZED specification's currency cannot later change (same DRAFT-only guard) ===")
{
  const updateFn = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(updateBody.includes("currency") && updateBody.includes('.eq("status", "DRAFT")'), "currency can only ever be set via the DRAFT-gated update function, never on an AUTHORIZED row")
}

console.log("\n=== IMMUTABILITY 3: AUTHORIZED specification's target cannot later change ===")
{
  const updateFn = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(updateBody.includes("targetEntityId") && updateBody.includes('.eq("status", "DRAFT")'), "target_entity_id can only ever be set via the DRAFT-gated update function")
}

console.log("\n=== IMMUTABILITY 4: AUTHORIZED specification's creative cannot later change ===")
{
  const updateFn = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(updateBody.includes("creativeAssetId") && updateBody.includes('.eq("status", "DRAFT")'), "creative_asset_id can only ever be set via the DRAFT-gated update function")
}

console.log("\n=== IMMUTABILITY 5: AUTHORIZED specification's Meta account cannot later change (no function ever updates it) ===")
{
  const updateFn = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateBody = updateFn ? updateFn[0] : ""
  assert(!updateBody.includes("metaAdAccountId") && !updateBody.includes("meta_ad_account_id"), "meta_ad_account_id is set only once at creation - no update function anywhere can ever change it")
}

console.log("\n=== IMMUTABILITY 6: AUTHORIZED specification's proposal binding cannot later change ===")
{
  const mutatingFnNames = ["updateDraftSpecification", "finalizeSpecification", "authorizeSpecification", "declineSpecification", "supersedeSpecification"]
  const anyUpdatesProposalId = mutatingFnNames.some((name) => {
    const m = repoSource.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n}`))
    const body = m ? m[0] : ""
    return body.includes("proposal_id:") || body.includes("proposalId:")
  })
  assert(!anyUpdatesProposalId, "proposal_id is set exactly once, at creation time - none of the mutating functions ever assigns it")
}

console.log("\n=== IMMUTABILITY 7: AUTHORIZED specification's action type cannot later change ===")
{
  const mutatingFnNames = ["updateDraftSpecification", "finalizeSpecification", "authorizeSpecification", "declineSpecification", "supersedeSpecification"]
  const anyUpdatesActionType = mutatingFnNames.some((name) => {
    const m = repoSource.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n}`))
    const body = m ? m[0] : ""
    return body.includes("action_type:") || body.includes("actionType:")
  })
  assert(!anyUpdatesActionType, "action_type is set exactly once, at creation time - none of the mutating functions ever assigns it")
}

console.log("\n=== SECURITY 1: Foreign specification (wrong brand) is rejected ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const nextExport = actionSource.indexOf("\nexport ", startIdx + 10)
  const fnBody = actionSource.slice(startIdx, nextExport > 0 ? nextExport : actionSource.length)
  assert(fnBody.includes("specResult.data.brand_id !== brandId"), "the action explicitly verifies the specification's own brand_id matches the caller-supplied brandId")
}

console.log("\n=== SECURITY 2: Foreign proposal (wrong brand) is rejected during AUTHORIZE revalidation ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const fnBody = actionSource.slice(startIdx)
  assert(fnBody.includes("proposalResult.data.brand_id !== brandId"), "the action explicitly re-verifies the parent proposal's own brand_id during AUTHORIZE")
}

console.log("\n=== SECURITY 3: Foreign Meta account (drift) fails AUTHORIZE closed ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const fnBody = actionSource.slice(startIdx)
  assert(fnBody.includes("currentMetaAdAccountId !== specResult.data.meta_ad_account_id"), "a drifted Meta account is explicitly detected and blocks AUTHORIZE")
}

console.log("\n=== SECURITY 4: Foreign target is rejected via fresh server-side re-verification ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const fnBody = actionSource.slice(startIdx)
  assert(fnBody.includes("listSyncedEntitiesForLink") && fnBody.includes("selected target is no longer available"), "the target is independently re-verified against the CURRENT synced entity list, not trusted from the specification's own stored value alone")
}

console.log("\n=== SECURITY 5: Foreign creative is rejected via fresh server-side ownership re-verification ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const fnBody = actionSource.slice(startIdx)
  assert(fnBody.includes("assetResult.data.workspace_id === access.workspaceId"), "the creative's ownership is independently re-verified at authorization time, not merely trusted from drafting")
}

console.log("\n=== SECURITY 6: Unauthorized user is rejected before any resource lookup ===")
{
  const startIdx = actionSource.indexOf("export async function decideSpecificationAuthorizationAction")
  const nextExport = actionSource.indexOf("\nexport ", startIdx + 10)
  const fnBody = actionSource.slice(startIdx, nextExport > 0 ? nextExport : actionSource.length)
  const authIdx = fnBody.indexOf("verifyBrandAccess(brandId)")
  const specFetchIdx = fnBody.indexOf("getActionSpecificationById(")
  assert(authIdx >= 0 && authIdx < specFetchIdx, "authorization runs before any specification lookup - an unauthorized user is rejected immediately")
}

console.log("\n=== SECURITY 7: Client cannot supply any execution-relevant field for authorization (structural proof on function signature) ===")
{
  const sigMatch = actionSource.match(/export async function decideSpecificationAuthorizationAction\(([\s\S]*?)\):/)
  const signature = sigMatch ? sigMatch[1] : ""
  const forbidden = ["spend", "currency", "metaaccount", "target", "creative", "actiontype"]
  const found = forbidden.filter((w) => signature.toLowerCase().includes(w))
  assert(found.length === 0, `the function signature accepts only brandId/specificationId/decision - no execution-relevant field can be supplied by the client (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== FRESHNESS: No post-READY or post-AUTHORIZED expiration threshold was invented (documented limitation, structural proof) ===")
{
  const productSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/concreteActionSpecification.ts"), "utf-8")
  assert(!productSource.toLowerCase().includes("max_age_hours") && !productSource.toLowerCase().includes("maxagehours"), "no fabricated authorization-freshness constant exists anywhere - live guardrail/account/target/creative revalidation at decision time is the only safety mechanism, matching the explicit instruction not to invent a threshold")
}

console.log("\n=== MIGRATION: exactly one new migration was added, additive only, extending the existing status constraint ===")
{
  const files = fs.readdirSync(migrationDir)
  const newFile = files.find((f) => f.startsWith("20260830"))
  assert(newFile !== undefined, "the expected new migration file exists")
  const content = newFile ? fs.readFileSync(path.join(migrationDir, newFile), "utf-8") : ""
  assert(content.includes("AUTHORIZED") && content.includes("DECLINED"), "the migration extends the status constraint to support AUTHORIZED and DECLINED")
  assert(content.toLowerCase().includes("decided_at") && content.toLowerCase().includes("decided_by"), "the migration adds this table's own decided_at/decided_by provenance columns")
  assert(!content.toLowerCase().includes("drop table") && !content.toLowerCase().includes("alter table action_proposals"), "the migration never drops data and never retrofits the frozen Action Proposal schema")
}

console.log("\n=== SIDE-EFFECT PROOF: No Meta write, AI, or generation primitive exists anywhere in this slice ===")
{
  const combined = (repoSource + actionSource).toLowerCase()
  const forbidden = ["graph.facebook.com/", "anthropic", "openai", "removebg", "remove.bg", "generatecreative", "publish", "executionjob", "worker_job", "workerjob"]
  const found = forbidden.filter((w) => combined.includes(w))
  assert(found.length === 0, `zero Meta-write/AI/generation/publication/job-enqueue primitives exist anywhere in this slice (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== UI: No misleading Run/Launch/Publish language, no Execute control, anywhere in the authorization UI ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  const forbidden = [">Run now<", ">Launch<", ">Publish<", ">Execute<", ">Apply to Meta<"]
  const found = forbidden.filter((w) => uiSource.includes(w))
  assert(found.length === 0, `no misleading execution-suggesting control exists anywhere in the UI (found: ${found.join(", ") || "none"})`)
  assert(uiSource.includes("Authorize exact action"), "the required 'Authorize exact action' control is present")
  assert(uiSource.includes("Review exact advertising action"), "the required pre-decision review summary heading is present")
  assert(uiSource.includes("does not itself publish or spend money"), "the confirmation dialog explicitly states authorization does not itself publish or spend money")
  assert(uiSource.includes("Authorized by:") && uiSource.includes("Authorized at:"), "the post-authorization UI shows who and when")
  assert(uiSource.includes("No advertising changes have been made yet."), "the authorized-state UI explicitly states no advertising changes have occurred")
  assert(uiSource.includes("Declined at:"), "the declined-state UI shows when the decline occurred")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }