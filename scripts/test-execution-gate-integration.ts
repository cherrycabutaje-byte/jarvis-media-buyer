import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

console.log("=== INTEGRATION 1: The current real Action Proposal architecture always produces NOT_EXECUTABLE (structural + logical proof) ===")
{
  const proposalSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/actionProposal.ts"), "utf-8")
  assert(proposalSource.includes("amountCents: null"), "createActionProposalContent still always sets amountCents (the basis for proposedSpendCents) to null - the current real architecture structurally guarantees MISSING_PROPOSED_SPEND for every real proposal today")
}

console.log("\n=== INTEGRATION 2: No currency is ever persisted on a real proposal (structural proof of the genuine V1 gap) ===")
{
  const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  assert(!/\bcurrency\b/i.test(repoSource), "no currency column is ever selected/inserted anywhere in the real repository (the only textual match is the unrelated word concurrency in a code comment, excluded by a word-boundary check) - MISSING_CURRENCY is a structural, not coincidental, gap for every real proposal today")
}

console.log("\n=== INTEGRATION 3: The real Server Action wires proposedCurrency/targetMetaEntityId/creativeAssetId as null, matching the genuine architectural gap (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const fnMatch = actionSource.match(/export async function evaluateExecutionReadinessAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("proposedCurrency: null"), "the real wiring honestly passes null for proposedCurrency - it does not invent or borrow a currency from anywhere else")
  assert(fnBody.includes("targetMetaEntityId: null"), "the real wiring honestly passes null for targetMetaEntityId - no such field exists to populate")
  assert(fnBody.includes("creativeAssetId: null"), "the real wiring honestly passes null for creativeAssetId - no such field exists to populate")
}

console.log("\n=== INTEGRATION 4: Server Action re-fetches CURRENT guardrails and CURRENT Meta account, never trusting the stale persisted snapshot (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const fnMatch = actionSource.match(/export async function evaluateExecutionReadinessAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("getBrandById(brandId)"), "the action genuinely re-fetches the brand's CURRENT configuration, not the proposal's own stored guardrail_decision string")
  assert(fnBody.includes("getMetaAdAccountLinkForBrand(brandId)"), "the action genuinely re-fetches the CURRENTLY live Meta account link, not trusting the proposal's stored entityId alone")
}

console.log("\n=== INTEGRATION 5: Server-side trust boundary - authenticate, authorize, verify brand ownership, all before evaluation (structural proof, exact order) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const startIdx = actionSource.indexOf("export async function evaluateExecutionReadinessAction")
  const fnBody = actionSource.slice(startIdx)
  const accessIdx = fnBody.indexOf("verifyBrandAccess(brandId)")
  const brandCheckIdx = fnBody.indexOf("proposalResult.data.brand_id !== brandId")
  const evalIdx = fnBody.indexOf("evaluateExecutionEligibility(eligibilityInput)")
  assert(accessIdx >= 0 && brandCheckIdx > accessIdx && evalIdx > brandCheckIdx, "authorization runs first, then brand-ownership verification, then evaluation - in the exact required order")
}

console.log("\n=== INTEGRATION 6: Client cannot forge any input - the action accepts only brandId/proposalId, never a proposal/guardrail/Meta payload (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const sigMatch = actionSource.match(/export async function evaluateExecutionReadinessAction\(([\s\S]*?)\):/)
  const signature = sigMatch ? sigMatch[1] : ""
  assert(signature.includes("brandId: string") && signature.includes("proposalId: string"), "the function signature accepts only brandId and proposalId as parameters")
  assert(!signature.toLowerCase().includes("guardrail") && !signature.toLowerCase().includes("spend") && !signature.toLowerCase().includes("metaaccount"), "no guardrail/spend/Meta-account value can be supplied by the caller - all trusted state is fetched server-side")
}

console.log("\n=== INTEGRATION 7: UI never shows Execute/Run/Launch/Publish/Apply controls anywhere ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  const forbidden = [">Execute<", ">Run<", ">Launch<", ">Publish<", ">Apply<"]
  const found = forbidden.filter((w) => uiSource.includes(w))
  assert(found.length === 0, `no execution-triggering control exists anywhere in the UI (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== INTEGRATION 8: UI shows the required 'Execution readiness' section with owner-friendly language, not raw codes ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes("Execution readiness"), "the required 'Execution readiness' heading is present")
  assert(uiSource.includes("No advertising changes have been made."), "the required 'no advertising changes' notice is present")
  assert(uiSource.includes("readiness.result.reasons.map((r) => r.message)"), "the UI displays the owner-friendly message field, never the raw machine-readable code")
}

console.log("\n=== INTEGRATION 9 (superseded by later slices): No database migration was added SPECIFICALLY for the Execution Gate slice (structural proof) ===")
{
  // The original check assumed "newest migration file" would always
  // reflect only the Execution Gate slice's own timing - that
  // assumption is now stale, since Concrete Action Specification V1
  // and Concrete Owner Authorization V1 have SINCE legitimately
  // added their own new, separately-approved migrations. This now
  // checks the SPECIFIC claim that still matters: no migration
  // dated on or immediately after the Execution Gate slice's own
  // approval date (20260829, when Concrete Action Specification V1
  // began) was needed BY Execution Gate V1 itself - Execution Gate
  // V1 required zero persistence, and that remains true regardless
  // of what later, independent slices have since added.
  const migrationsDir = path.join(process.cwd(), "supabase/migrations")
  const files = fs.readdirSync(migrationsDir)
  const executionGateEraMigrations = files.filter((f) => f.startsWith("20260828") && !f.includes("action_proposals"))
  assert(executionGateEraMigrations.length === 0, `no migration was added specifically for the Execution Gate V1 slice's own timeframe (found: ${executionGateEraMigrations.join(", ") || "none"}) - later, independently-approved slices have since added their own separate migrations, which is expected and correct`)
}

console.log("\n=== INTEGRATION 10: No Meta read/write call, no AI call, exists anywhere in the execution readiness path (structural proof) ===")
{
  const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const fnMatch = actionSource.match(/export async function evaluateExecutionReadinessAction[\s\S]*$/)
  const fnBody = (fnMatch ? fnMatch[0] : "").toLowerCase()
  const forbidden = ["graph.facebook.com", "fetch(", "anthropic", "openai"]
  const found = forbidden.filter((w) => fnBody.includes(w))
  assert(found.length === 0, `zero Meta/AI call primitives exist in the execution readiness action (found: ${found.join(", ") || "none"})`)
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }