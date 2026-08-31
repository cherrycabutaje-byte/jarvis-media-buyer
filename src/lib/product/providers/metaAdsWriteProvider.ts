/**
 * Meta Ads Write Provider - CONTRACT ONLY, V1.
 *
 * This file defines the exact narrow, typed primitive operations a
 * FUTURE live implementation would need to expose - it contains NO
 * live Graph API calls, no fetch/POST logic, and no implementation
 * of any kind. Every method signature below exists purely so
 * buildMetaExecutionPlan()'s output (a MetaExecutionOperation
 * sequence) maps cleanly onto a future concrete implementation,
 * without that implementation existing yet.
 *
 * DELIBERATELY NARROW: each method corresponds to exactly one
 * planned MetaExecutionOperation from metaExecutionPlan.ts. No
 * broad, catch-all methods like executeAction(anything) or
 * mutateCampaign(payload) exist - a future implementer cannot
 * accidentally perform an unplanned mutation through this
 * interface, because the interface itself has no method capable of
 * expressing one.
 *
 * NOT INCLUDED (deliberately, pending the Spend Model Mismatch and
 * Creative/Copy Insufficiency findings in metaExecutionPlan.ts):
 *   - createAdSet() / createCampaign(): budget-controlling
 *     operations are not modeled here because no execution strategy
 *     requiring them has been approved yet.
 *   - Any budget-mutation method: this slice never mutates a
 *     campaign or ad set's budget, and the current plan does not
 *     require it.
 */

export type MetaProviderErrorCode =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "INVALID_TARGET"
  | "INVALID_CREATIVE"
  | "INVALID_ASSET"
  | "INVALID_PAGE_IDENTITY"
  | "DUPLICATE_REQUEST"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN_PROVIDER_ERROR"

export interface MetaProviderError {
  code: MetaProviderErrorCode
  message: string
}

export interface MetaProviderResult<T> {
  success: boolean
  data: T | null
  error: MetaProviderError | null
}

export interface UploadCreativeAssetParams {
  metaAdAccountId: string
  /** Idempotency key - see metaExecutionPlan.ts's idempotency
   * documentation. Tied to the authorized specification's own ID,
   * never an arbitrary client-generated value. */
  idempotencyKey: string
  storagePath: string
  mimeType: string
}

export interface UploadCreativeAssetResultData {
  metaImageHashOrVideoId: string
}

export interface CreateAdCreativeParams {
  metaAdAccountId: string
  idempotencyKey: string
  pageId: string
  instagramActorId: string | null
  metaImageHashOrVideoId: string
  primaryText: string
  headline: string | null
  description: string | null
  destinationUrl: string
  callToActionType: string
}

export interface CreateAdCreativeResultData {
  metaAdCreativeId: string
}

export interface CreateAdParams {
  metaAdAccountId: string
  idempotencyKey: string
  targetAdSetId: string
  metaAdCreativeId: string
  /** Every newly created ad starts PAUSED - see metaExecutionPlan.ts's
   * status-safety documentation. This is the only value this
   * contract accepts in V1; there is deliberately no way to request
   * an active initial status through this interface. */
  initialStatus: "PAUSED"
}

export interface CreateAdResultData {
  metaAdId: string
}

/**
 * CONTRACT ONLY - no implementation exists. A future live
 * implementation of this interface is Meta Write Provider V1, a
 * separate, not-yet-approved slice.
 */
export interface MetaAdsWriteProvider {
  uploadCreativeAsset(params: UploadCreativeAssetParams): Promise<MetaProviderResult<UploadCreativeAssetResultData>>
  createAdCreative(params: CreateAdCreativeParams): Promise<MetaProviderResult<CreateAdCreativeResultData>>
  createAd(params: CreateAdParams): Promise<MetaProviderResult<CreateAdResultData>>
}