/**
 * Meta Ads Read Provider V1 - vendor-agnostic interface.
 *
 * STRICT READ-ONLY: exactly five read methods and nothing else. No
 * generic "request" method exists. No method can create, update,
 * delete, pause, or scale anything in Meta.
 *
 * Based on official Meta documentation verified during this slice
 * (Marketing API v26.0, current as of end of July 2026): ads_read
 * permission is sufficient for read-only reporting access to owned/
 * managed ad accounts; ad account IDs are prefixed "act_"; Insights
 * is an edge available on the account, campaign, ad set, or ad
 * object; standard Graph API cursor-based pagination.
 */

export type MetaEntityType = "ACCOUNT" | "CAMPAIGN" | "AD_SET" | "AD"

export interface MetaAdAccountData {
  id: string
  name: string | null
  accountStatus: string | null
  currency: string | null
}

export interface MetaCampaignData {
  id: string
  name: string | null
  status: string | null
  effectiveStatus: string | null
  objective: string | null
  createdTime: string | null
}

export interface MetaAdSetData {
  id: string
  campaignId: string
  name: string | null
  status: string | null
  effectiveStatus: string | null
}

export interface MetaAdData {
  id: string
  adSetId: string
  name: string | null
  status: string | null
  effectiveStatus: string | null
}

/**
 * Every metric is genuinely nullable: missing from Meta's response
 * means null, never a fabricated 0. Only a metric Meta genuinely
 * reported as 0 is stored as 0.
 */
export interface MetaAdObservation {
  entityType: MetaEntityType
  entityId: string
  periodStart: string
  periodEnd: string
  currency: string | null
  spend: number | null
  impressions: number | null
  reach: number | null
  frequency: number | null
  cpm: number | null
  clicks: number | null
  linkClicks: number | null
  ctr: number | null
  cpc: number | null
  results: number | null
  costPerResult: number | null
  purchaseConversionValue: number | null
  roas: number | null
  attributionSetting: string | null
}

export interface MetaProviderError {
  category: "INVALID_TOKEN" | "MISSING_PERMISSION" | "INVALID_ACCOUNT" | "RATE_LIMITED" | "TRANSIENT" | "MALFORMED_RESPONSE" | "UNKNOWN"
  message: string
}

/**
 * Normalized, safe observation of Meta's official usage/rate-limit
 * header (X-Business-Use-Case-Usage, documented at
 * developers.facebook.com/docs/graph-api/overview/rate-limiting).
 * This is provider-operational telemetry, not a Performance Monitor
 * feature - it exists so calling code can know whether a request is
 * approaching platform limits, nothing more. Every field is
 * genuinely nullable: the raw header is absent on many responses,
 * and a malformed header must never crash parsing - it simply
 * yields all-null usage info.
 */
export interface MetaUsageInfo {
  callCountPercent: number | null
  totalTimePercent: number | null
  totalCpuTimePercent: number | null
  estimatedTimeToRegainAccessMinutes: number | null
}

export interface MetaProviderResult<T> {
  success: boolean
  data: T | null
  error: MetaProviderError | null
  usage: MetaUsageInfo | null
}

export interface DateRange {
  since: string
  until: string
}

export interface MetaAdsReadProvider {
  getAdAccount(accessToken: string, adAccountId: string): Promise<MetaProviderResult<MetaAdAccountData>>
  listCampaigns(accessToken: string, adAccountId: string): Promise<MetaProviderResult<MetaCampaignData[]>>
  listAdSets(accessToken: string, campaignId: string): Promise<MetaProviderResult<MetaAdSetData[]>>
  listAds(accessToken: string, adSetId: string): Promise<MetaProviderResult<MetaAdData[]>>
  getInsights(accessToken: string, entityId: string, entityType: MetaEntityType, dateRange: DateRange): Promise<MetaProviderResult<MetaAdObservation[]>>
}
