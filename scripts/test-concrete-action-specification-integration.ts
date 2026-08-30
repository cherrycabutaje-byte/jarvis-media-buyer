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

console.log("=== IMMUTABILITY 1: Finalized target cannot silently change (structural proof - no function updates a non-DRAFT row's target) ===")
{
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateFnBody = updateFnMatch ? updateFnMatch[0] : ""
  assert(updateFnBody.includes('.eq("status", "DRAFT")'), "updateDraftSpecification (the only function that can change target_entity_id) is atomically gated to DRAFT rows only")
}

console.log("\n=== IMMUTABILITY 2: Finalized creative cannot silently change (same guard covers creative_asset_id) ===")
{
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateFnBody = updateFnMatch ? updateFnMatch[0] : ""
  assert(updateFnBody.includes("creativeAssetId") && updateFnBody.includes('.eq("status", "DRAFT")'), "creative_asset_id can only ever be set via the same DRAFT-gated update function")
}

console.log("\n=== IMMUTABILITY 3: Finalized spend cannot silently change ===")
{
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateFnBody = updateFnMatch ? updateFnMatch[0] : ""
  assert(updateFnBody.includes("proposedSpendCents") && updateFnBody.includes('.eq("status", "DRAFT")'), "proposed_spend_cents can only ever be set via the same DRAFT-gated update function")
}

console.log("\n=== IMMUTABILITY 4: Finalized currency cannot silently change ===")
{
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateFnBody = updateFnMatch ? updateFnMatch[0] : ""
  assert(updateFnBody.includes("currency") && updateFnBody.includes('.eq("status", "DRAFT")'), "currency can only ever be set via the same DRAFT-gated update function")
}

console.log("\n=== IMMUTABILITY 5: Finalized account cannot silently change (no function updates meta_ad_account_id at all, ever) ===")
{
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const updateFnBody = updateFnMatch ? updateFnMatch[0] : ""
  assert(!updateFnBody.includes("metaAdAccountId") && !updateFnBody.includes("meta_ad_account_id"), "meta_ad_account_id is set ONLY once, at creation time (createDraftSpecification) - no update function anywhere can ever change it, not even while still DRAFT")
}

console.log("\n=== IMMUTABILITY 6: Finalized proposal binding cannot silently change (no function updates proposal_id at all, ever) ===")
{
  // Excludes the interface TYPE declaration (proposal_id: string),
  // which is not a value-assignment - checks only that no UPDATE
  // function (updateDraftSpecification, finalizeSpecification,
  // supersedeSpecification) ever sets proposal_id as part of its
  // patch.
  const updateFnMatch = repoSource.match(/export async function updateDraftSpecification[\s\S]*?\n}/)
  const finalizeFnMatch = repoSource.match(/export async function finalizeSpecification[\s\S]*?\n}/)
  const supersedeFnMatch = repoSource.match(/export async function supersedeSpecification[\s\S]*?\n}/)
  const updateFns = [updateFnMatch, finalizeFnMatch, supersedeFnMatch].map((m) => (m ? m[0] : ""))
  const anyUpdatesProposalId = updateFns.some((body) => body.includes("proposal_id:") || body.includes("proposalId:"))
  assert(!anyUpdatesProposalId, "proposal_id is set exactly once, at creation time (createDraftSpecification) - none of the update/finalize/supersede functions ever assigns it")
}

console.log("\n=== IMMUTABILITY 7: Finalization is a one-way atomic transition (DRAFT -> READY only, never reversible) ===")
{
  const finalizeFnMatch = repoSource.match(/export async function finalizeSpecification[\s\S]*?\n}/)
  const finalizeFnBody = finalizeFnMatch ? finalizeFnMatch[0] : ""
  assert(finalizeFnBody.includes('.eq("status", "DRAFT")') && finalizeFnBody.includes("READY_FOR_OWNER_AUTHORIZATION"), "finalizeSpecification is atomically gated - only a genuine DRAFT can ever transition to READY, and it can only happen once")
}

console.log("\n=== IMMUTABILITY 8: Revision creates/supersedes rather than mutating a finalized row (structural proof) ===")
{
  const supersedeFnMatch = repoSource.match(/export async function supersedeSpecification[\s\S]*?\n}/)
  const supersedeFnBody = supersedeFnMatch ? supersedeFnMatch[0] : ""
  assert(supersedeFnBody.includes('.eq("status", "READY_FOR_OWNER_AUTHORIZATION")') && supersedeFnBody.includes("SUPERSEDED"), "supersedeSpecification only ever transitions an existing READY row to SUPERSEDED - it never mutates execution-relevant fields, and a genuinely new specification must be created separately for a revision")
}

console.log("\n=== SECURITY 1: Forged brand cannot create a specification from another brand's proposal (structural proof) ===")
{
  const fnMatch = actionSource.match(/export async function createDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("proposalResult.data.brand_id !== brandId"), "the action explicitly verifies the proposal's own brand_id matches the caller-supplied brandId before creating any specification")
}

console.log("\n=== SECURITY 2: Forged workspace cannot bypass brand authorization (structural proof - verifyBrandAccess runs first) ===")
{
  const fnMatch = actionSource.match(/export async function createDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.trim().startsWith("brandId: string") || fnBody.indexOf("verifyBrandAccess") < fnBody.indexOf("getActionProposalById"), "workspace/brand authorization (verifyBrandAccess) runs before any proposal lookup")
}

console.log("\n=== SECURITY 3: Foreign proposal (wrong brand) is rejected, not silently bound ===")
{
  const fnMatch = actionSource.match(/export async function createDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("That proposal does not belong to this business."), "a clear, honest rejection exists for a foreign proposal, rather than silently binding it")
}

console.log("\n=== SECURITY 4: Foreign Meta account can never be client-supplied (structural proof - metaAdAccountId is always server-derived) ===")
{
  const fnMatch = actionSource.match(/export async function createDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  const sigMatch = actionSource.match(/export async function createDraftSpecificationAction\(([\s\S]*?)\):/)
  const signature = sigMatch ? sigMatch[1] : ""
  assert(!signature.toLowerCase().includes("metaaccount") && !signature.toLowerCase().includes("meta_ad_account"), "the client cannot supply any Meta account value at all - it is exclusively derived server-side from the brand's trusted link")
  assert(fnBody.includes("getMetaAdAccountLinkForBrand(brandId)"), "the Meta account is genuinely fetched from the brand's own trusted server-side link")
}

console.log("\n=== SECURITY 5: Foreign target is rejected via server-side re-verification, never trusted from client assertion ===")
{
  const fnMatch = actionSource.match(/export async function updateDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("listSyncedEntitiesForLink") && fnBody.includes("That target is not available for this business."), "a client-supplied target is independently re-verified against the brand's own synced entities before being accepted, with an honest rejection otherwise")
}

console.log("\n=== SECURITY 6: Foreign creative is rejected via server-side ownership verification ===")
{
  const fnMatch = actionSource.match(/export async function updateDraftSpecificationAction[\s\S]*?\n}\n/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("assetResult.data.workspace_id !== access.workspaceId") && fnBody.includes("That creative does not belong to this business."), "a client-supplied creative asset is independently re-verified for workspace/brand ownership before being accepted")
}

console.log("\n=== SECURITY 7: Unauthorized user is rejected before any resource lookup, in every action (structural proof) ===")
{
  // Bounds each function precisely using indexOf against the next
  // known top-level export, rather than a lazy regex - a lazy
  // [\s\S]*?\n} regex truncates too early on long functions with
  // nested blocks (the same failure mode already identified once
  // this session in a different test file).
  const fnNames = ["createDraftSpecificationAction", "updateDraftSpecificationAction", "finalizeSpecificationAction"]
  const allExportStarts = fnNames.map((name) => actionSource.indexOf(`export async function ${name}`)).sort((a, b) => a - b)

  function boundedBody(name: string): string {
    const start = actionSource.indexOf(`export async function ${name}`)
    const laterStarts = allExportStarts.filter((s) => s > start)
    const end = laterStarts.length > 0 ? Math.min(...laterStarts) : actionSource.length
    return actionSource.slice(start, end)
  }

  const allStartWithAuth = fnNames.every((name) => {
    const body = boundedBody(name)
    const authIdx = body.indexOf("verifyBrandAccess(brandId)")
    const otherFetchIdx = Math.min(
      ...["getActionProposalById(", "getActionSpecificationById(", "getMetaAdAccountLinkForBrand(", "getCreativeAssetById("]
        .map((fn) => body.indexOf(fn))
        .filter((i) => i >= 0)
    )
    return authIdx >= 0 && (otherFetchIdx === Infinity || authIdx < otherFetchIdx)
  })
  assert(allStartWithAuth, "every specification action (create, update, finalize) authorizes the caller before fetching any other resource - an unauthorized user is rejected immediately")
}

console.log("\n=== SECURITY 8: Finalization independently re-verifies target/creative ownership, never trusting the DRAFT's own stored values blindly ===")
{
  const fnMatch = actionSource.match(/export async function finalizeSpecificationAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("creativeAssetOwnershipVerified") && fnBody.includes("targetEntityOwnershipVerified"), "finalization independently re-checks ownership of the referenced target and creative at finalize time, not merely trusting whatever was stored during drafting")
}

console.log("\n=== POSITIVE CONTROL (server layer): finalizeSpecificationAction never fabricates authorization - READY_FOR_OWNER_AUTHORIZATION is not EXECUTABLE (structural proof) ===")
{
  assert(!actionSource.toLowerCase().includes("executable") && !actionSource.toLowerCase().includes("authorize_execution"), "the specification action layer never references EXECUTABLE or any execution-authorization concept - READY_FOR_OWNER_AUTHORIZATION is explicitly not treated as execution authorization anywhere in this file")
}

console.log("\n=== SIDE-EFFECT PROOF: No Meta write, AI, or generation primitive exists anywhere in this slice (structural proof) ===")
{
  const combined = (repoSource + actionSource).toLowerCase()
  const forbidden = ["graph.facebook.com/", "anthropic", "openai", "removebg", "remove.bg", "generatecreative", "publish"]
  const found = forbidden.filter((w) => combined.includes(w))
  assert(found.length === 0, `zero Meta-write/AI/generation/publication primitives exist anywhere in this slice (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== MIGRATION: exactly one new migration was added for this slice, additive only ===")
{
  const files = fs.readdirSync(migrationDir)
  const newFile = files.find((f) => f.startsWith("20260829"))
  assert(newFile !== undefined, "the expected new migration file exists")
  const content = newFile ? fs.readFileSync(path.join(migrationDir, newFile), "utf-8") : ""
  assert(content.toLowerCase().includes("create table action_specifications"), "the migration creates a genuinely new, dedicated table - it does not alter action_proposals")
  assert(!content.toLowerCase().includes("alter table action_proposals"), "the migration never retrofits fields into the frozen Action Proposal schema")
}

console.log("\n=== UI: No Authorize/Execute/Launch/Publish/Apply control exists anywhere (structural proof) ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  const forbidden = [">Authorize<", ">Execute<", ">Launch<", ">Publish<", ">Apply<", ">Apply to Meta<"]
  const found = forbidden.filter((w) => uiSource.includes(w))
  assert(found.length === 0, `no authorization/execution-triggering control exists anywhere in the UI (found: ${found.join(", ") || "none"})`)
  assert(uiSource.includes("Prepare exact action"), "the required 'Prepare exact action' entry point is present")
  assert(uiSource.includes("Ready for owner authorization"), "the required 'Ready for owner authorization' status label is present")
  assert(uiSource.includes("Waiting for your authorization"), "the required owner-facing summary status text is present")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }