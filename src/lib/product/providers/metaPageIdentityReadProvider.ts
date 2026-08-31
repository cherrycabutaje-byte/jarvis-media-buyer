/**
 * Meta Page & Instagram Identity Read Provider - CONTRACT + fake
 * implementations only, V1.
 *
 * CONFIRMED PERMISSION GAP: see metaPageIdentity.ts's module
 * documentation for the full finding - no evidence exists anywhere
 * in this repository that the currently connected Meta token holds
 * the pages_show_list / instagram_basic permissions Meta's Graph
 * API requires for these reads. ads_read/ads_management (the only
 * scopes this repository's existing ad-read operations require) do
 * not grant Page-list or Instagram-business-account access.
 *
 * This file defines the narrow, typed, READ-ONLY interface a live
 * implementation would need. It is kept entirely separate from
 * MetaAdsWriteProvider (no write methods) and from MetaAdsReadProvider
 * (Page/Instagram identity is a materially different read domain
 * from ad performance/structure reads) to keep each provider
 * narrowly scoped to its own concern.
 *
 * Deliberate exact operations (from actual Meta Graph API semantics,
 * frozen at v26.0 - never silently upgraded):
 *   listAccessiblePages()  -> GET /me/accounts (requires pages_show_list)
 *   getPageInstagramIdentity() -> GET /{page-id}?fields=instagram_business_account
 *                                  then GET /{ig-id}?fields=username
 *                                  (requires instagram_basic)
 */

export type MetaPageProviderErrorCode =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN_PROVIDER_ERROR"

export interface MetaPageProviderError {
  code: MetaPageProviderErrorCode
  message: string
}

export interface MetaPageProviderResult<T> {
  success: boolean
  data: T | null
  error: MetaPageProviderError | null
}

export interface RawAccessiblePage {
  id: string | null
  name: string | null
}

export interface RawPageInstagramIdentity {
  instagramBusinessAccountId: string | null
  instagramUsername: string | null
}

/**
 * CONTRACT ONLY in V1 given the confirmed permission gap above - no
 * live Graph API implementation is included. Tests use deterministic
 * fake implementations of this same interface, never a live Meta
 * account.
 */
export interface MetaPageIdentityReadProvider {
  listAccessiblePages(accessToken: string): Promise<MetaPageProviderResult<RawAccessiblePage[]>>
  getPageInstagramIdentity(accessToken: string, pageId: string): Promise<MetaPageProviderResult<RawPageInstagramIdentity>>
}