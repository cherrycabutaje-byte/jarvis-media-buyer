import { evaluateMetaIdentityPermissionCapability, type MetaPermissionCapability } from "@/lib/product/metaPermission"
import { LiveMetaPermissionProvider, type MetaPermissionProvider, type MetaPermissionProviderResult } from "@/lib/product/providers/metaPermissionProvider"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

console.log("=== CASE 1: pages_show_list granted -> Page identity CAPABLE ===")
{
  const permissions: MetaPermissionCapability[] = [{ permission: "pages_show_list", status: "granted" }]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.pageIdentityRead === "CAPABLE", "a granted pages_show_list permission yields CAPABLE for Page identity read")
}

console.log("\n=== CASE 2: pages_show_list declined -> Page identity MISSING_PERMISSION ===")
{
  const permissions: MetaPermissionCapability[] = [{ permission: "pages_show_list", status: "declined" }]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.pageIdentityRead === "MISSING_PERMISSION", "a declined pages_show_list permission yields MISSING_PERMISSION")
}

console.log("\n=== CASE 3: pages_show_list absent entirely -> Page identity MISSING_PERMISSION ===")
{
  const permissions: MetaPermissionCapability[] = [{ permission: "ads_read", status: "granted" }]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.pageIdentityRead === "MISSING_PERMISSION", "an absent pages_show_list permission (not even listed) yields MISSING_PERMISSION - never assumed granted")
}

console.log("\n=== CASE 4: instagram_basic granted -> Instagram identity CAPABLE ===")
{
  const permissions: MetaPermissionCapability[] = [{ permission: "instagram_basic", status: "granted" }]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.instagramIdentityRead === "CAPABLE", "a granted instagram_basic permission yields CAPABLE for Instagram identity read")
}

console.log("\n=== CASE 5: ads_read granted alone does NOT imply Page or Instagram capability (independence proof) ===")
{
  const permissions: MetaPermissionCapability[] = [
    { permission: "ads_read", status: "granted" },
    { permission: "ads_management", status: "granted" },
  ]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.pageIdentityRead === "MISSING_PERMISSION" && result.instagramIdentityRead === "MISSING_PERMISSION", "ads_read/ads_management being granted never implies Page or Instagram identity capability - the two permission domains are genuinely independent")
}

console.log("\n=== CASE 6: Undetermined permissions (provider call failed) -> UNKNOWN, never assumed CAPABLE or MISSING_PERMISSION ===")
{
  const result = evaluateMetaIdentityPermissionCapability(null)
  assert(result.pageIdentityRead === "UNKNOWN" && result.instagramIdentityRead === "UNKNOWN", "a genuinely undetermined permission state (null) fails closed to UNKNOWN for both capabilities, never a false positive or false negative")
}

console.log("\n=== CASE 7: Both permissions granted -> both capabilities CAPABLE (positive control) ===")
{
  const permissions: MetaPermissionCapability[] = [
    { permission: "pages_show_list", status: "granted" },
    { permission: "instagram_basic", status: "granted" },
  ]
  const result = evaluateMetaIdentityPermissionCapability(permissions)
  assert(result.pageIdentityRead === "CAPABLE" && result.instagramIdentityRead === "CAPABLE", "when both permissions are genuinely granted, both capabilities correctly evaluate CAPABLE - proving the evaluator is not hardcoded to always reject")
}

async function runProviderTests() {
  console.log("\n=== PROVIDER 1: LiveMetaPermissionProvider fails closed with no token, never attempts a call ===")
  {
    const provider: MetaPermissionProvider = new LiveMetaPermissionProvider()
    const result: MetaPermissionProviderResult = await provider.getGrantedPermissions("")
    assert(!result.success && result.error?.code === "TOKEN_UNAVAILABLE", "an empty/missing token fails closed with TOKEN_UNAVAILABLE before any network call is attempted")
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) { process.exit(1) }
}

runProviderTests()