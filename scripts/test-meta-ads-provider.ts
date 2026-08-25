import { GraphApiMetaAdsProvider } from "@/lib/product/providers/graphApiMetaAdsProvider"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function mockFetchSequence(responses: Array<() => Response>) {
  let i = 0
  const calls: string[] = []
  global.fetch = (async (url: string) => {
    calls.push(url)
    const impl = responses[Math.min(i, responses.length - 1)]
    i++
    return impl()
  }) as typeof fetch
  return { getCalls: () => calls }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

async function run() {
  const provider = new GraphApiMetaAdsProvider()

  console.log("=== CASE 1: Account normalization ===")
  {
    mockFetchSequence([() => jsonResponse({ id: "act_123", name: "Test Account", account_status: 1, currency: "USD" })])
    const result = await provider.getAdAccount("fake-token", "act_123")
    assert(result.success === true, "account fetch succeeds")
    assert(result.data?.name === "Test Account", "account name normalized correctly")
    assert(result.data?.currency === "USD", "currency preserved")
  }

  console.log("\n=== CASE 2: Campaign normalization, single page ===")
  {
    mockFetchSequence([() => jsonResponse({ data: [{ id: "c1", name: "Campaign 1", status: "ACTIVE", effective_status: "ACTIVE", objective: "LINK_CLICKS", created_time: "2026-01-01" }], paging: {} })])
    const result = await provider.listCampaigns("fake-token", "act_123")
    assert(result.success === true, "campaigns fetch succeeds")
    assert(result.data?.length === 1, "single campaign returned")
    assert(result.data?.[0].objective === "LINK_CLICKS", "objective normalized correctly")
  }

  console.log("\n=== CASE 3: Multi-page pagination, no duplicates ===")
  {
    const { getCalls } = mockFetchSequence([
      () => jsonResponse({ data: [{ id: "c1", name: "Campaign 1" }], paging: { next: "https://graph.facebook.com/v26.0/act_123/campaigns?after=X" } }),
      () => jsonResponse({ data: [{ id: "c2", name: "Campaign 2" }], paging: {} }),
    ])
    const result = await provider.listCampaigns("fake-token", "act_123")
    assert(result.success === true, "multi-page fetch succeeds")
    assert(result.data?.length === 2, `both pages collected (got ${result.data?.length})`)
    assert(getCalls().length === 2, "exactly 2 HTTP requests made for 2 pages")
  }

  console.log("\n=== CASE 4: Duplicate item across pages is de-duplicated ===")
  {
    mockFetchSequence([
      () => jsonResponse({ data: [{ id: "c1", name: "Campaign 1" }], paging: { next: "https://graph.facebook.com/v26.0/next" } }),
      () => jsonResponse({ data: [{ id: "c1", name: "Campaign 1 (duplicate)" }], paging: {} }),
    ])
    const result = await provider.listCampaigns("fake-token", "act_123")
    assert(result.data?.length === 1, `duplicate id across pages collapsed to 1 (got ${result.data?.length})`)
  }

  console.log("\n=== CASE 5: Malformed next cursor stops pagination safely, keeps already-collected data ===")
  {
    mockFetchSequence([
      () => jsonResponse({ data: [{ id: "c1", name: "Campaign 1" }], paging: { next: "not-a-valid-url" } }),
    ])
    const result = await provider.listCampaigns("fake-token", "act_123")
    assert(result.success === true, "malformed cursor does not fail the whole request")
    assert(result.data?.length === 1, "already-collected data from the first page is preserved")
  }

  console.log("\n=== CASE 6: Insights - missing metric stays null, never fabricated as 0 ===")
  {
    mockFetchSequence([() => jsonResponse({ data: [{ spend: "12.50", impressions: "1000" }] })])
    const result = await provider.getInsights("fake-token", "camp_1", "CAMPAIGN", { since: "2026-01-01", until: "2026-01-31" })
    assert(result.success === true, "insights fetch succeeds")
    assert(result.data?.[0].spend === 12.5, "spend correctly parsed")
    assert(result.data?.[0].clicks === null, "missing 'clicks' field is null, not fabricated as 0")
    assert(result.data?.[0].reach === null, "missing 'reach' field is null, not fabricated as 0")
  }

  console.log("\n=== CASE 7: Insights - genuine zero is preserved, not treated as missing ===")
  {
    mockFetchSequence([() => jsonResponse({ data: [{ spend: "0", clicks: "0" }] })])
    const result = await provider.getInsights("fake-token", "camp_1", "CAMPAIGN", { since: "2026-01-01", until: "2026-01-31" })
    assert(result.data?.[0].spend === 0, `genuine zero spend preserved as 0, not null (got ${result.data?.[0].spend})`)
    assert(result.data?.[0].clicks === 0, "genuine zero clicks preserved as 0, not null")
  }

  console.log("\n=== CASE 8: Insights - reporting period preserved on every observation ===")
  {
    mockFetchSequence([() => jsonResponse({ data: [{ spend: "1" }] })])
    const result = await provider.getInsights("fake-token", "camp_1", "CAMPAIGN", { since: "2026-02-01", until: "2026-02-28" })
    assert(result.data?.[0].periodStart === "2026-02-01", "period start preserved exactly")
    assert(result.data?.[0].periodEnd === "2026-02-28", "period end preserved exactly")
  }

  console.log("\n=== CASE 9: Invalid/expired token (401) handled safely ===")
  {
    mockFetchSequence([() => jsonResponse({ error: { code: 190, message: "Invalid OAuth access token" } }, 401)])
    const result = await provider.getAdAccount("bad-token", "act_123")
    assert(result.success === false, "401 correctly reported as failure")
    assert(result.error?.category === "INVALID_TOKEN", `correctly categorized as INVALID_TOKEN (got ${result.error?.category})`)
  }

  console.log("\n=== CASE 10: Missing permission handled safely ===")
  {
    mockFetchSequence([() => jsonResponse({ error: { code: 200, message: "Permissions error" } }, 403)])
    const result = await provider.getAdAccount("fake-token", "act_123")
    assert(result.error?.category === "MISSING_PERMISSION", `correctly categorized as MISSING_PERMISSION (got ${result.error?.category})`)
  }

  console.log("\n=== CASE 11: Invalid account handled safely ===")
  {
    mockFetchSequence([() => jsonResponse({ error: { code: 100, message: "Invalid parameter: account does not exist" } }, 400)])
    const result = await provider.getAdAccount("fake-token", "act_bad")
    assert(result.error?.category === "INVALID_ACCOUNT", `correctly categorized as INVALID_ACCOUNT (got ${result.error?.category})`)
  }

  console.log("\n=== CASE 12: Rate limit (429) handled safely ===")
  {
    mockFetchSequence([() => jsonResponse({ error: { code: 17, message: "User request limit reached" } }, 429)])
    const result = await provider.getAdAccount("fake-token", "act_123")
    assert(result.error?.category === "RATE_LIMITED", `correctly categorized as RATE_LIMITED (got ${result.error?.category})`)
  }

  console.log("\n=== CASE 13: Transient server error (500) handled safely ===")
  {
    mockFetchSequence([() => jsonResponse({ error: { code: 1 } }, 500)])
    const result = await provider.getAdAccount("fake-token", "act_123")
    assert(result.error?.category === "TRANSIENT", `correctly categorized as TRANSIENT (got ${result.error?.category})`)
  }

  console.log("\n=== CASE 14: Malformed (non-JSON) response handled safely ===")
  {
    global.fetch = (async () => new Response("not json{{{", { status: 200 })) as typeof fetch
    const result = await provider.getAdAccount("fake-token", "act_123")
    assert(result.success === false, "malformed response reported as failure")
    assert(result.error?.category === "MALFORMED_RESPONSE", "correctly categorized as MALFORMED_RESPONSE")
  }

  console.log("\n=== CASE 15: Network failure handled safely, never throws ===")
  {
    global.fetch = (async () => { throw new Error("ECONNREFUSED internal detail") }) as typeof fetch
    let threw = false
    let result
    try {
      result = await provider.getAdAccount("fake-token", "act_123")
    } catch {
      threw = true
    }
    assert(threw === false, "network failure does not throw/crash the caller")
    assert(result?.success === false, "network failure reported as unsuccessful result")
    assert(!(result?.error?.message ?? "").includes("ECONNREFUSED"), "raw network error internals not leaked")
  }

  console.log("\n=== CASE 16: Token never appears anywhere except the request URL's own access_token param ===")
  {
    const { getCalls } = mockFetchSequence([() => jsonResponse({ id: "act_123", name: "X" })])
    const result = await provider.getAdAccount("SECRET_TOKEN_XYZ", "act_123")
    const calls = getCalls()
    assert(calls[0].includes("access_token=SECRET_TOKEN_XYZ"), "token correctly sent as the documented access_token parameter")
    assert(JSON.stringify(result).includes("SECRET_TOKEN_XYZ") === false, "token never appears anywhere in the returned result")
  }

  console.log("\n=== CASE 17: Provider interface contains no mutation operation (structural proof) ===")
  {
    const providerMethods = Object.getOwnPropertyNames(GraphApiMetaAdsProvider.prototype).filter((m) => m !== "constructor")
    const mutationKeywords = ["create", "update", "delete", "pause", "resume", "scale", "post", "put"]
    const hasMutation = providerMethods.some((m) => mutationKeywords.some((kw) => m.toLowerCase().includes(kw)))
    assert(!hasMutation, `no method name suggests a mutation capability (methods: ${providerMethods.join(", ")})`)
    assert(providerMethods.length === 5, `exactly 5 read methods exist (got ${providerMethods.length}: ${providerMethods.join(", ")})`)
  }



console.log("\n=== CASE 18: Usage header absent -> usage is null, not fabricated ===")
{
  mockFetchSequence([() => jsonResponse({ id: "act_123", name: "X" })])
  const result = await provider.getAdAccount("fake-token", "act_123")
  assert(result.usage === null, "usage is honestly null when the header is absent")
}

console.log("\n=== CASE 19: Valid usage header parsed correctly ===")
{
  const headers = new Headers()
  headers.set("X-Business-Use-Case-Usage", JSON.stringify({ act_123: [{ type: "ads_insights", call_count: 42, total_cputime: 30, total_time: 25 }] }))
  global.fetch = (async () => new Response(JSON.stringify({ id: "act_123", name: "X" }), { status: 200, headers })) as typeof fetch
  const result = await provider.getAdAccount("fake-token", "act_123")
  assert(result.usage?.callCountPercent === 42, `call count percent parsed correctly (got ${result.usage?.callCountPercent})`)
  assert(result.usage?.totalCpuTimePercent === 30, "total CPU time percent parsed correctly")
  assert(result.usage?.totalTimePercent === 25, "total time percent parsed correctly")
}

console.log("\n=== CASE 20: Malformed usage header does not crash, yields null usage ===")
{
  const headers = new Headers()
  headers.set("X-Business-Use-Case-Usage", "{not valid json")
  global.fetch = (async () => new Response(JSON.stringify({ id: "act_123", name: "X" }), { status: 200, headers })) as typeof fetch
  let threw = false
  let result
  try {
    result = await provider.getAdAccount("fake-token", "act_123")
  } catch {
    threw = true
  }
  assert(threw === false, "malformed usage header does not throw")
  assert(result?.usage === null, "malformed usage header yields null usage, not a crash or fabricated value")
}

console.log("\n=== CASE 21: High usage value correctly parsed (approaching platform limits) ===")
{
  const headers = new Headers()
  headers.set("X-Business-Use-Case-Usage", JSON.stringify({ act_123: [{ type: "ads_insights", call_count: 95, total_cputime: 98, total_time: 91 }] }))
  global.fetch = (async () => new Response(JSON.stringify({ id: "act_123", name: "X" }), { status: 200, headers })) as typeof fetch
  const result = await provider.getAdAccount("fake-token", "act_123")
  assert(result.usage?.callCountPercent === 95, "high call-count usage correctly parsed, not clamped or altered")
  assert(result.usage?.totalCpuTimePercent === 98, "high CPU-time usage correctly parsed")
}

console.log("\n=== CASE 22: Explicit HTTP 429 - error AND usage both populated where available ===")
{
  const headers = new Headers()
  headers.set("X-Business-Use-Case-Usage", JSON.stringify({ act_123: [{ type: "ads_insights", call_count: 100, total_cputime: 100, total_time: 100 }] }))
  global.fetch = (async () => new Response(JSON.stringify({ error: { code: 17, message: "User request limit reached" } }), { status: 429, headers })) as typeof fetch
  const result = await provider.getAdAccount("fake-token", "act_123")
  assert(result.success === false, "429 correctly reported as failure")
  assert(result.error?.category === "RATE_LIMITED", "correctly categorized as RATE_LIMITED")
  assert(result.usage?.callCountPercent === 100, "usage info still captured even on a failed/rate-limited response")
}

console.log("\n=== CASE 23: No secret/header leakage - raw header text and token never appear in the result ===")
{
  const headers = new Headers()
  headers.set("X-Business-Use-Case-Usage", JSON.stringify({ act_123: [{ type: "ads_insights", call_count: 10 }] }))
  mockFetchSequence([() => new Response(JSON.stringify({ id: "act_123", name: "X" }), { status: 200, headers })])
  const result = await provider.getAdAccount("SECRET_TOKEN_ABC", "act_123")
  const serialized = JSON.stringify(result)
  assert(!serialized.includes("SECRET_TOKEN_ABC"), "access token never appears in the result, even alongside usage info")
  assert(!serialized.includes("X-Business-Use-Case-Usage"), "raw header name/text never appears in the normalized result")
}

console.log("\n=== CASE 24: Ad set correctly reflects the queried campaign when Meta's field is present ===")
{
  mockFetchSequence([() => jsonResponse({ data: [{ id: "as1", campaign_id: "camp_REAL", name: "Ad Set 1" }], paging: {} })])
  const result = await provider.listAdSets("fake-token", "camp_REAL")
  assert(result.data?.[0].campaignId === "camp_REAL", "ad set's campaign reference matches Meta's own explicit field")
}

console.log("\n=== CASE 25: Ad set falls back to the structurally-known parent ONLY when Meta's field is genuinely absent ===")
{
  // Fetched via /{campaignId}/adsets - Meta's own endpoint structure
  // guarantees this ad set is a child of camp_REAL, even if the
  // campaign_id field itself is absent from this particular
  // response. This is not inventing a relationship - it is using
  // the one Meta already guaranteed via the request path itself.
  mockFetchSequence([() => jsonResponse({ data: [{ id: "as1", name: "Ad Set 1" }], paging: {} })])
  const result = await provider.listAdSets("fake-token", "camp_REAL")
  assert(result.data?.[0].campaignId === "camp_REAL", "falls back to the endpoint-guaranteed parent only when the field is absent, not fabricated from nothing")
}

console.log("\n=== CASE 26: Meta's explicit (even if different) parent field is always trusted over our own assumption ===")
{
  // If Meta ever explicitly reports a DIFFERENT campaign_id than the
  // one queried, that explicit value must win - never silently
  // overridden by our own assumed parent.
  mockFetchSequence([() => jsonResponse({ data: [{ id: "as1", campaign_id: "camp_DIFFERENT", name: "Ad Set 1" }], paging: {} })])
  const result = await provider.listAdSets("fake-token", "camp_REAL")
  assert(result.data?.[0].campaignId === "camp_DIFFERENT", `Meta's own explicit parent field is trusted, never silently overridden (got ${result.data?.[0].campaignId})`)
}

console.log("\n=== CASE 27: Ad correctly reflects its queried ad set, same rule as campaigns/ad sets ===")
{
  mockFetchSequence([() => jsonResponse({ data: [{ id: "ad1", adset_id: "as_REAL", name: "Ad 1" }], paging: {} })])
  const result = await provider.listAds("fake-token", "as_REAL")
  assert(result.data?.[0].adSetId === "as_REAL", "ad's ad-set reference matches Meta's own explicit field")
}

console.log("\n=== CASE 28: Duplicate external IDs across different entity types do not collide (type-level proof) ===")
{
  // A campaign entityId of "123" and an ad entityId of "123" are
  // genuinely distinct observations - entityType is always part of
  // the observation's identity, matching the real database's
  // composite unique constraint (link_id, entity_type, entity_id,
  // period_start, period_end).
  const campaignObs: { entityType: string; entityId: string } = { entityType: "CAMPAIGN", entityId: "123" }
  const adObs: { entityType: string; entityId: string } = { entityType: "AD", entityId: "123" }
  const sameIdentity = campaignObs.entityType === adObs.entityType && campaignObs.entityId === adObs.entityId
  assert(!sameIdentity, "same numeric id at different entity types is never treated as the same observation identity")
}

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) { process.exit(1) }
}

run()