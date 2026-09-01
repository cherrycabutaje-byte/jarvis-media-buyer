/**
 * Meta Permission Provider - REAL, GET-only implementation, V1.
 *
 * Unlike MetaPageIdentityReadProvider (contract-only, since the
 * exact permission required for Page/Instagram reads was unknown
 * until this slice), THIS provider CAN be safely implemented for
 * real: GET /{user-id}/permissions requires only the already-vaulted
 * access token itself - no Meta App ID/App Secret is needed to make
 * this call, since inspecting what permissions YOUR OWN token holds
 * never requires the OAuth app credentials, only a valid token
 * (exactly the same trust boundary already used by every existing
 * ads-read operation).
 *
 * NEVER logs, returns, or otherwise exposes the access token itself
 * - it is used only as a query parameter in the request URL, exactly
 * matching the existing documented pattern for every other Meta read
 * call in this codebase.
 *
 * NO OAUTH FLOW IS IMPLEMENTED HERE OR ANYWHERE IN THIS SLICE - this
 * provider only inspects the CURRENTLY held token's permissions. It
 * cannot request new permissions, initiate consent, or exchange an
 * authorization code - no Meta App ID/App Secret/OAuth flow exists
 * anywhere in this repository (confirmed OAUTH_CONFIGURATION_REQUIRED,
 * see the final slice report for the full finding).
 */

import type { MetaPermissionCapability } from "@/lib/product/metaPermission"

export type MetaPermissionProviderErrorCode = "TOKEN_UNAVAILABLE" | "AUTHENTICATION_ERROR" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "MALFORMED_PROVIDER_RESPONSE"

export interface MetaPermissionProviderError {
  code: MetaPermissionProviderErrorCode
  message: string
}

export interface MetaPermissionProviderResult {
  success: boolean
  data: MetaPermissionCapability[] | null
  error: MetaPermissionProviderError | null
}

export interface MetaPermissionProvider {
  getGrantedPermissions(accessToken: string): Promise<MetaPermissionProviderResult>
}

/** Confirmed from metaAdsReadProvider.ts and metaPageIdentity.ts -
 * frozen at v26.0, never silently upgraded. */
const META_GRAPH_API_VERSION = "v26.0"
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

interface RawMetaPermissionEntry {
  permission?: unknown
  status?: unknown
}

/**
 * The real, genuine implementation. A live GET call to Meta's own
 * permission-inspection endpoint using only the already-vaulted
 * token - no App ID/App Secret required. Never called from any
 * automated test in this slice (those use a deterministic fake
 * implementing the same interface) - this class exists to be wired
 * into production, and is exercised only via optional, explicitly
 * gated manual/live validation when a real credential is available.
 */
export class LiveMetaPermissionProvider implements MetaPermissionProvider {
  async getGrantedPermissions(accessToken: string): Promise<MetaPermissionProviderResult> {
    if (!accessToken) {
      return { success: false, data: null, error: { code: "TOKEN_UNAVAILABLE", message: "No Meta credential is available to inspect." } }
    }

    let response: Response
    try {
      response = await fetch(`${META_GRAPH_BASE_URL}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: "GET" })
    } catch {
      return { success: false, data: null, error: { code: "PROVIDER_UNAVAILABLE", message: "Could not reach Meta to inspect permissions." } }
    }

    if (response.status === 401) {
      return { success: false, data: null, error: { code: "AUTHENTICATION_ERROR", message: "The Meta credential is no longer valid." } }
    }
    if (response.status === 429) {
      return { success: false, data: null, error: { code: "RATE_LIMITED", message: "Meta is currently rate-limiting this request." } }
    }
    if (!response.ok) {
      return { success: false, data: null, error: { code: "PROVIDER_UNAVAILABLE", message: "Meta could not process the permission inspection request." } }
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch {
      return { success: false, data: null, error: { code: "MALFORMED_PROVIDER_RESPONSE", message: "Meta returned a response that could not be understood." } }
    }

    const entries = (parsed as { data?: unknown })?.data
    if (!Array.isArray(entries)) {
      return { success: false, data: null, error: { code: "MALFORMED_PROVIDER_RESPONSE", message: "Meta returned a response that could not be understood." } }
    }

    const normalized: MetaPermissionCapability[] = []
    for (const entry of entries as RawMetaPermissionEntry[]) {
      if (typeof entry.permission !== "string" || (entry.status !== "granted" && entry.status !== "declined")) {
        continue
      }
      normalized.push({ permission: entry.permission, status: entry.status })
    }

    return { success: true, data: normalized, error: null }
  }
}