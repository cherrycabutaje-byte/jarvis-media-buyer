import type {
  MetaAdsReadProvider,
  MetaProviderResult,
  MetaProviderError,
  MetaUsageInfo,
  MetaAdAccountData,
  MetaCampaignData,
  MetaAdSetData,
  MetaAdData,
  MetaAdObservation,
  MetaEntityType,
  DateRange,
} from "@/lib/product/providers/metaAdsReadProvider"

const GRAPH_API_VERSION = "v26.0"
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const MAX_PAGES = 20

function categorizeError(status: number, body: unknown): MetaProviderError {
  const errObj = (body as { error?: { code?: number; message?: string } })?.error
  const code = errObj?.code
  const message = errObj?.message ?? `HTTP ${status}`

  if (status === 401 || code === 190) {
    return { category: "INVALID_TOKEN", message: "The Meta access token is invalid or expired." }
  }
  if (code === 200 || code === 10) {
    return { category: "MISSING_PERMISSION", message: "This app does not have the required permission for this request." }
  }
  if (status === 400 && (message.toLowerCase().includes("does not exist") || message.toLowerCase().includes("invalid"))) {
    return { category: "INVALID_ACCOUNT", message: "The requested Meta ad account or entity could not be found." }
  }
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return { category: "RATE_LIMITED", message: "Meta's API rate limit was reached. Please try again shortly." }
  }
  if (status >= 500 || code === 1 || code === 2) {
    return { category: "TRANSIENT", message: "Meta's API was temporarily unavailable. Please try again." }
  }
  return { category: "UNKNOWN", message }
}

function parseUsageHeader(response: Response): MetaUsageInfo | null {
  const raw = response.headers.get("X-Business-Use-Case-Usage")
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>
    const firstKey = Object.keys(parsed)[0]
    if (!firstKey) return null
    const entries = parsed[firstKey]
    if (!Array.isArray(entries) || entries.length === 0) return null
    const entry = entries[0]

    const toPercent = (v: unknown): number | null => {
      if (typeof v === "number") return v
      if (typeof v === "string") {
        const n = Number.parseFloat(v)
        return Number.isNaN(n) ? null : n
      }
      return null
    }

    return {
      callCountPercent: toPercent(entry.call_count),
      totalTimePercent: toPercent(entry.total_time),
      totalCpuTimePercent: toPercent(entry.total_cputime),
      estimatedTimeToRegainAccessMinutes: toPercent(entry.estimated_time_to_regain_access),
    }
  } catch {
    return null
  }
}

async function graphGet(accessToken: string, path: string, params: Record<string, string>): Promise<MetaProviderResult<unknown>> {
  const url = new URL(`${GRAPH_API_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set("access_token", accessToken)

  let response: Response
  try {
    response = await fetch(url.toString(), { method: "GET" })
  } catch {
    return { success: false, data: null, error: { category: "TRANSIENT", message: "Could not reach Meta's API. Please try again." }, usage: null }
  }

  const usage = parseUsageHeader(response)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { success: false, data: null, error: { category: "MALFORMED_RESPONSE", message: "Meta returned an unreadable response." }, usage }
  }

  if (!response.ok) {
    return { success: false, data: null, error: categorizeError(response.status, body), usage }
  }

  return { success: true, data: body, error: null, usage }
}

async function paginateAll(accessToken: string, initialUrl: string): Promise<MetaProviderResult<Record<string, unknown>[]>> {
  const items: Record<string, unknown>[] = []
  const seenIds = new Set<string>()
  let nextUrl: string | null = initialUrl
  let pageCount = 0
  let lastUsage: MetaUsageInfo | null = null

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount++
    let response: Response
    try {
      response = await fetch(nextUrl, { method: "GET" })
    } catch {
      return { success: false, data: null, error: { category: "TRANSIENT", message: "Could not reach Meta's API during pagination." }, usage: lastUsage }
    }

    lastUsage = parseUsageHeader(response) ?? lastUsage

    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { success: false, data: null, error: { category: "MALFORMED_RESPONSE", message: "Meta returned an unreadable paginated response." }, usage: lastUsage }
    }

    if (!response.ok) {
      return { success: false, data: null, error: categorizeError(response.status, body), usage: lastUsage }
    }

    const page = body as { data?: Record<string, unknown>[]; paging?: { next?: string } }
    const pageItems = Array.isArray(page.data) ? page.data : []
    for (const item of pageItems) {
      const id = typeof item.id === "string" ? item.id : null
      if (id !== null) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      }
      items.push(item)
    }

    const next = page.paging?.next
    nextUrl = typeof next === "string" && next.startsWith("https://") ? next : null
  }

  return { success: true, data: items, error: null, usage: lastUsage }
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const num = typeof value === "string" ? Number.parseFloat(value) : typeof value === "number" ? value : NaN
  return Number.isNaN(num) ? null : num
}

function extractActionValue(actions: unknown, actionType: string): number | null {
  if (!Array.isArray(actions)) return null
  const match = actions.find((a) => a && typeof a === "object" && (a as { action_type?: string }).action_type === actionType)
  if (!match) return null
  return toNumber((match as { value?: unknown }).value)
}

export class GraphApiMetaAdsProvider implements MetaAdsReadProvider {
  async getAdAccount(accessToken: string, adAccountId: string): Promise<MetaProviderResult<MetaAdAccountData>> {
    const result = await graphGet(accessToken, `/${adAccountId}`, { fields: "id,name,account_status,currency" })
    if (!result.success || !result.data) {
      return { success: false, data: null, error: result.error, usage: result.usage }
    }
    const raw = result.data as Record<string, unknown>
    return {
      success: true,
      error: null,
      usage: result.usage,
      data: {
        id: typeof raw.id === "string" ? raw.id : adAccountId,
        name: typeof raw.name === "string" ? raw.name : null,
        accountStatus: raw.account_status !== undefined ? String(raw.account_status) : null,
        currency: typeof raw.currency === "string" ? raw.currency : null,
      },
    }
  }

  async listCampaigns(accessToken: string, adAccountId: string): Promise<MetaProviderResult<MetaCampaignData[]>> {
    const url = new URL(`${GRAPH_API_BASE}/${adAccountId}/campaigns`)
    url.searchParams.set("fields", "id,name,status,effective_status,objective,created_time")
    url.searchParams.set("access_token", accessToken)
    url.searchParams.set("limit", "100")

    const result = await paginateAll(accessToken, url.toString())
    if (!result.success || !result.data) {
      return { success: false, data: null, error: result.error, usage: result.usage }
    }
    return {
      success: true,
      error: null,
      usage: result.usage,
      data: result.data.map((raw) => ({
        id: String(raw.id ?? ""),
        name: typeof raw.name === "string" ? raw.name : null,
        status: typeof raw.status === "string" ? raw.status : null,
        effectiveStatus: typeof raw.effective_status === "string" ? raw.effective_status : null,
        objective: typeof raw.objective === "string" ? raw.objective : null,
        createdTime: typeof raw.created_time === "string" ? raw.created_time : null,
      })),
    }
  }

  async listAdSets(accessToken: string, campaignId: string): Promise<MetaProviderResult<MetaAdSetData[]>> {
    const url = new URL(`${GRAPH_API_BASE}/${campaignId}/adsets`)
    url.searchParams.set("fields", "id,campaign_id,name,status,effective_status")
    url.searchParams.set("access_token", accessToken)
    url.searchParams.set("limit", "100")

    const result = await paginateAll(accessToken, url.toString())
    if (!result.success || !result.data) {
      return { success: false, data: null, error: result.error, usage: result.usage }
    }
    return {
      success: true,
      error: null,
      usage: result.usage,
      data: result.data.map((raw) => ({
        id: String(raw.id ?? ""),
        campaignId: typeof raw.campaign_id === "string" ? raw.campaign_id : campaignId,
        name: typeof raw.name === "string" ? raw.name : null,
        status: typeof raw.status === "string" ? raw.status : null,
        effectiveStatus: typeof raw.effective_status === "string" ? raw.effective_status : null,
      })),
    }
  }

  async listAds(accessToken: string, adSetId: string): Promise<MetaProviderResult<MetaAdData[]>> {
    const url = new URL(`${GRAPH_API_BASE}/${adSetId}/ads`)
    url.searchParams.set("fields", "id,adset_id,name,status,effective_status")
    url.searchParams.set("access_token", accessToken)
    url.searchParams.set("limit", "100")

    const result = await paginateAll(accessToken, url.toString())
    if (!result.success || !result.data) {
      return { success: false, data: null, error: result.error, usage: result.usage }
    }
    return {
      success: true,
      error: null,
      usage: result.usage,
      data: result.data.map((raw) => ({
        id: String(raw.id ?? ""),
        adSetId: typeof raw.adset_id === "string" ? raw.adset_id : adSetId,
        name: typeof raw.name === "string" ? raw.name : null,
        status: typeof raw.status === "string" ? raw.status : null,
        effectiveStatus: typeof raw.effective_status === "string" ? raw.effective_status : null,
      })),
    }
  }

  async getInsights(
    accessToken: string,
    entityId: string,
    entityType: MetaEntityType,
    dateRange: DateRange
  ): Promise<MetaProviderResult<MetaAdObservation[]>> {
    // reach is confirmed still active/documented in the official
    // Ads Insights API (verified directly against live Meta
    // developer documentation during this slice). The Post/Page/
    // Video reach retirement announced for mid-2026 applies to a
    // different Graph API surface (organic Page/Post Insights), not
    // this Ads Marketing API Insights endpoint. No "views" field
    // exists in Ads Insights to substitute - none is fabricated.
    const fields = ["spend", "impressions", "reach", "frequency", "cpm", "clicks", "ctr", "cpc", "actions", "action_values", "purchase_roas"].join(",")

    const result = await graphGet(accessToken, `/${entityId}/insights`, {
      fields,
      time_range: JSON.stringify({ since: dateRange.since, until: dateRange.until }),
    })

    if (!result.success || !result.data) {
      return { success: false, data: null, error: result.error, usage: result.usage }
    }

    const body = result.data as { data?: Record<string, unknown>[] }
    const rows = Array.isArray(body.data) ? body.data : []

    return {
      success: true,
      error: null,
      usage: result.usage,
      data: rows.map((raw) => {
        const roasArray = (raw as { purchase_roas?: unknown }).purchase_roas
        const roasValue = Array.isArray(roasArray) && roasArray.length > 0 ? toNumber((roasArray[0] as { value?: unknown })?.value) : null

        return {
          entityType,
          entityId,
          periodStart: dateRange.since,
          periodEnd: dateRange.until,
          currency: null,
          spend: toNumber(raw.spend),
          impressions: toNumber(raw.impressions),
          reach: toNumber(raw.reach),
          frequency: toNumber(raw.frequency),
          cpm: toNumber(raw.cpm),
          clicks: toNumber(raw.clicks),
          linkClicks: extractActionValue(raw.actions, "link_click"),
          ctr: toNumber(raw.ctr),
          cpc: toNumber(raw.cpc),
          results: extractActionValue(raw.actions, "purchase"),
          costPerResult: null,
          purchaseConversionValue: extractActionValue((raw as { action_values?: unknown }).action_values, "purchase"),
          roas: roasValue,
          attributionSetting: null,
        }
      }),
    }
  }
}
