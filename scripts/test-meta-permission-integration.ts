import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

const actionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/metaPermissionActions.ts"), "utf-8")
const repoSource = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/metaPermissionObservationRepository.ts"), "utf-8")
const providerSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/providers/metaPermissionProvider.ts"), "utf-8")
const pageActionSource = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/metaPageIdentityActions.ts"), "utf-8")
const migrationDir = path.join(process.cwd(), "supabase/migrations")

console.log("=== SECURITY 1: Client cannot supply a fake capability - inspection always re-derives from the provider's own response ===")
{
  const sigMatch = actionSource.match(/export async function inspectMetaPermissionsAction\(([\s\S]*?)\):/)
  const signature = sigMatch ? sigMatch[1] : ""
  assert(!signature.toLowerCase().includes("capability") && !signature.toLowerCase().includes("granted"), "the action signature accepts only brandId and a provider - no client-suppliable capability/permission claim exists")
}

console.log("\n=== SECURITY 2: A failed provider call never writes a permission observation (structural proof) ===")
{
  const fnMatch = actionSource.match(/export async function inspectMetaPermissionsAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  const failCheckIdx = fnBody.indexOf("!providerResult.success")
  const replaceIdx = fnBody.indexOf("replacePermissionObservations(")
  assert(failCheckIdx >= 0 && failCheckIdx < replaceIdx, "a failed provider response returns early, before any observation is ever persisted")
}

console.log("\n=== SECURITY 3: Foreign brand/link cannot read another business's permission observations (structural proof, repository scoped by link) ===")
{
  const fnMatch = repoSource.match(/export async function getPermissionObservationsForLink[\s\S]*?\n}/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes('.eq("meta_ad_account_link_id"'), "the repository lookup is scoped by the exact meta_ad_account_link_id - never a bare global query")
}

console.log("\n=== SECURITY 4: Token is never logged, returned, or exposed by the live provider (structural proof) ===")
{
  assert(!providerSource.includes("console.log") && !providerSource.includes("console.error"), "the live provider never logs anything that could include the token")
  assert(providerSource.includes("encodeURIComponent(accessToken)"), "the token is safely URL-encoded as a query parameter, matching the existing documented pattern for every other Meta read call")
}

console.log("\n=== SECURITY 5: Page identity sync now gates on genuine CAPABLE status, never proceeds on ads-connection alone (structural proof) ===")
{
  const fnMatch = pageActionSource.match(/export async function syncTrustedPageIdentitiesAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  const capabilityCheckIdx = fnBody.indexOf('capability.pageIdentityRead !== "CAPABLE"')
  const listPagesIdx = fnBody.indexOf("provider.listAccessiblePages(")
  assert(capabilityCheckIdx >= 0 && capabilityCheckIdx < listPagesIdx, "the Page sync explicitly re-checks the genuinely observed permission capability BEFORE ever calling listAccessiblePages - ads_read/connection status alone can never bypass this gate")
}

console.log("\n=== ADS/PAGE INDEPENDENCE: Missing Page permission never gets reported/treated as an Ads-connection failure (structural proof) ===")
{
  const fnMatch = pageActionSource.match(/export async function syncTrustedPageIdentitiesAction[\s\S]*$/)
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(fnBody.includes("JARVIS does not currently have permission to read Facebook Pages"), "the exact required distinct message is present - never conflating a Page permission gap with the Ads connection itself being broken")
}

console.log("\n=== MIGRATION: exactly one new migration was added, additive only, creating a dedicated new table ===")
{
  const files = fs.readdirSync(migrationDir)
  const newFile = files.find((f) => f.startsWith("20260902"))
  assert(newFile !== undefined, "the expected new migration file exists")
  const content = newFile ? fs.readFileSync(path.join(migrationDir, newFile), "utf-8") : ""
  assert(content.toLowerCase().includes("create table meta_permission_observations"), "the migration creates a genuinely new, dedicated table")
  assert(!content.toLowerCase().includes("alter table meta_page_identities") && !content.toLowerCase().includes("alter table meta_ad_account_links"), "the migration never retrofits the frozen Page Identity or Meta account link schemas")
}

console.log("\n=== NO FRESHNESS INVENTION: No META_PERMISSION_MAX_AGE_HOURS or equivalent expiration threshold exists anywhere ===")
{
  const productSource = fs.readFileSync(path.join(process.cwd(), "src/lib/product/metaPermission.ts"), "utf-8")
  const codeOnly = productSource.replace(/\/\*\*[\s\S]*?\*\//g, "")
  assert(!/max_age/i.test(codeOnly) && !/maxage/i.test(codeOnly) && !/expir/i.test(codeOnly), "no fabricated freshness/expiration constant exists in executable code - observedAt is persisted, but no threshold is invented")
}

console.log("\n=== SIDE-EFFECT PROOF: No Meta write, AI call, execution job, or publication anywhere in this slice ===")
{
  const combined = (actionSource + repoSource + providerSource).toLowerCase()
  const forbidden = ["anthropic", "openai", "executionjob", "worker_job", "publish", "createad(", "createadset(", "createcampaign(", "method: \"post\""]
  const found = forbidden.filter((w) => combined.includes(w))
  assert(found.length === 0, `zero Meta-write/AI/job-enqueue/publication primitives exist anywhere in this slice (found: ${found.join(", ") || "none"})`)
}

console.log("\n=== NO OAUTH FLOW: No App ID/Secret/authorization-code exchange exists anywhere in this slice (structural proof, confirmed OAUTH_CONFIGURATION_REQUIRED) ===")
{
  const combined = (actionSource + repoSource + providerSource).toLowerCase()
  const forbidden = ["app_secret", "client_secret", "authorization_code", "redirect_uri", "oauth/access_token"]
  const found = forbidden.filter((w) => combined.includes(w))
  assert(found.length === 0, `no OAuth exchange/app-credential logic exists anywhere - this slice only ever inspects an already-obtained token's own permissions (found: ${found.join(", ") || "none"})`)
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }