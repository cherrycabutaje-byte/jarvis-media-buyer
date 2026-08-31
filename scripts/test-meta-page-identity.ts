import { normalizeMetaPageIdentities, isPageIdentityTrusted, type RawMetaPageResponse } from "@/lib/product/metaPageIdentity"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

console.log("=== CASE 1: Provider normalizes an accessible Page ===")
{
  const raw: RawMetaPageResponse[] = [{ id: "page_1", name: "My Page", instagramBusinessAccountId: null, instagramUsername: null }]
  const result = normalizeMetaPageIdentities(raw, "2026-09-01T00:00:00.000Z")
  assert(result.status === "SYNCED" && result.identities.length === 1, "a genuinely accessible Page is normalized")
  assert(result.identities[0].pageId === "page_1" && result.identities[0].name === "My Page", "Page ID and name are preserved exactly")
}

console.log("\n=== CASE 2: Page + linked Instagram normalized ===")
{
  const raw: RawMetaPageResponse[] = [{ id: "page_1", name: "My Page", instagramBusinessAccountId: "ig_1", instagramUsername: "mypage_ig" }]
  const result = normalizeMetaPageIdentities(raw, "2026-09-01T00:00:00.000Z")
  assert(result.identities[0].instagramActorId === "ig_1" && result.identities[0].instagramUsername === "mypage_ig", "a linked Instagram identity is normalized alongside its Page")
}

console.log("\n=== CASE 3: Page without Instagram is allowed (never invented) ===")
{
  const raw: RawMetaPageResponse[] = [{ id: "page_1", name: "My Page", instagramBusinessAccountId: null, instagramUsername: null }]
  const result = normalizeMetaPageIdentities(raw, "2026-09-01T00:00:00.000Z")
  assert(result.status === "SYNCED" && result.identities[0].instagramActorId === null, "a Page without any linked Instagram identity is honestly null, never invented, and does not block sync")
}

console.log("\n=== CASE 4: Malformed identity (missing Page ID) is skipped, never fabricated ===")
{
  const raw: RawMetaPageResponse[] = [{ id: null, name: "Ghost Page", instagramBusinessAccountId: null, instagramUsername: null }]
  const result = normalizeMetaPageIdentities(raw, "2026-09-01T00:00:00.000Z")
  assert(result.status === "SYNC_FAILED" && result.identities.length === 0, "a Page response missing a valid ID never becomes a trusted identity")
}

console.log("\n=== CASE 5: Empty response is a valid (not failed) sync of zero Pages ===")
{
  const result = normalizeMetaPageIdentities([], "2026-09-01T00:00:00.000Z")
  assert(result.status === "SYNCED" && result.identities.length === 0, "genuinely zero accessible Pages is a valid sync outcome, not a failure")
}

console.log("\n=== CASE 6: Trusted Page for correct brand/link -> verification succeeds ===")
{
  const trusted = isPageIdentityTrusted("page_1", ["page_1", "page_2"])
  assert(trusted === true, "a Page ID present in the trusted list for this exact link is verified")
}

console.log("\n=== CASE 7: Arbitrary/foreign Page ID -> verification fails ===")
{
  const trusted = isPageIdentityTrusted("page_FOREIGN", ["page_1", "page_2"])
  assert(trusted === false, "a Page ID absent from the trusted list fails verification - never assumed trusted")
}

console.log("\n=== CASE 8: Null selected Page ID -> verification fails ===")
{
  const trusted = isPageIdentityTrusted(null, ["page_1"])
  assert(trusted === false, "no selected Page ID can never be verified")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }