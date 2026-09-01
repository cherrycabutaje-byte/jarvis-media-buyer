/**
 * Meta OAuth Permission Capability V1.
 *
 * RESOLVES the confirmed PERMISSION_GAP from Meta Page Identity
 * Verification V1 by determining, from Meta's own trusted read-only
 * permission-inspection endpoint, whether the currently connected
 * token actually holds the permissions Page/Instagram identity
 * reads require - rather than assuming ads_read implies Page access.
 *
 * PERMANENT INVARIANTS:
 *   TOKEN_PRESENT != PERMISSION_GRANTED
 *   ads_read != Page identity permission
 *   REQUESTED_PERMISSION != GRANTED_PERMISSION
 *   GRANTED_PERMISSION != PAGE_ACCESS_VERIFIED
 *   PAGE_ACCESS_VERIFIED != PUBLISH_AUTHORIZATION
 *   PUBLISH_AUTHORIZATION != EXECUTION
 *
 * STATUS MODEL, JUSTIFIED BY ACTUAL META API SEMANTICS: Meta's Graph
 * API permission-inspection endpoint (GET /{user-id}/permissions)
 * reports each permission as exactly one of two statuses: "granted"
 * or "declined" - there is no third per-permission "expired" status
 * returned by this endpoint. Token-level unavailability/expiration
 * is a genuinely SEPARATE concept (a provider-level error, e.g.
 * TOKEN_UNAVAILABLE/AUTHENTICATION_ERROR - see metaPermissionProvider.ts),
 * never conflated with a per-permission status here. This module
 * therefore models only "granted" | "declined", matching the real
 * API - not a boolean, and not an invented "expired" value.
 *
 * ADS/PAGE CAPABILITY INDEPENDENCE: ads_read/ads_management and
 * pages_show_list/instagram_basic are entirely separate permissions.
 * A brand may legitimately have Ads read capability while lacking
 * Page identity capability, or vice versa - this module evaluates
 * ONLY the Page/Instagram identity permissions; it never inspects or
 * reports on ads_read/ads_management, and a missing Page permission
 * must never be interpreted as an Ads-connection failure anywhere
 * this module's output is consumed.
 *
 * NO FRESHNESS INVENTION: this module deliberately does NOT define a
 * META_PERMISSION_MAX_AGE_HOURS or equivalent expiration threshold -
 * no domain evidence justifies one. observedAt is persisted (by the
 * caller) so a future execution preflight can decide whether a fresh
 * permission check is warranted; that decision is explicitly
 * deferred, not resolved here.
 */

export type MetaPermissionStatus = "granted" | "declined"

export interface MetaPermissionCapability {
  permission: string
  status: MetaPermissionStatus
}

export type MetaIdentityCapabilityStatus = "CAPABLE" | "MISSING_PERMISSION" | "UNKNOWN"

export interface MetaIdentityPermissionCapabilityResult {
  pageIdentityRead: MetaIdentityCapabilityStatus
  instagramIdentityRead: MetaIdentityCapabilityStatus
}

/** The exact Meta permissions this identity-read capability
 * requires, per the Meta Execution Plan / Page Identity Verification
 * audits. Never inferred from ads_read/ads_management. */
const PAGE_IDENTITY_PERMISSION = "pages_show_list"
const INSTAGRAM_IDENTITY_PERMISSION = "instagram_basic"

function evaluateSingleCapability(permissions: MetaPermissionCapability[] | null, requiredPermission: string): MetaIdentityCapabilityStatus {
  if (permissions === null) return "UNKNOWN"
  const match = permissions.find((p) => p.permission === requiredPermission)
  if (!match) return "MISSING_PERMISSION"
  return match.status === "granted" ? "CAPABLE" : "MISSING_PERMISSION"
}

/**
 * Pure, deterministic evaluator. permissions === null represents a
 * genuinely undetermined state (e.g. the provider call itself failed)
 * and fails closed to UNKNOWN for both capabilities - never assumed
 * CAPABLE, never silently treated as MISSING_PERMISSION (which would
 * imply a definite negative that was never actually observed).
 */
export function evaluateMetaIdentityPermissionCapability(
  permissions: MetaPermissionCapability[] | null
): MetaIdentityPermissionCapabilityResult {
  return {
    pageIdentityRead: evaluateSingleCapability(permissions, PAGE_IDENTITY_PERMISSION),
    instagramIdentityRead: evaluateSingleCapability(permissions, INSTAGRAM_IDENTITY_PERMISSION),
  }
}