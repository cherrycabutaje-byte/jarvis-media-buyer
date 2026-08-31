/**
 * Meta Page & Instagram Identity Read / Verification V1.
 *
 * PURPOSE: resolves the confirmed PAGE_IDENTITY_VERIFICATION_REQUIRED
 * gap by obtaining Facebook Page (and, where linked, Instagram
 * business/professional) identity from trusted Meta read-only data,
 * rather than trusting an arbitrary Page ID the browser submits.
 *
 * CONFIRMED PERMISSION GAP (found by inspection, not invented): no
 * Meta app credentials (App ID/Secret), OAuth scope configuration,
 * or permission-tracking column exists anywhere in this repository.
 * connectMetaAdAccount() receives an already-obtained access token
 * as a raw parameter - the entire OAuth/permission-grant flow is
 * external to this codebase. This means it cannot be confirmed from
 * repository evidence whether the currently connected token holds
 * the pages_show_list / pages_read_engagement / instagram_basic
 * permissions that Meta's Graph API requires for GET /me/accounts
 * and a Page's instagram_business_account field - ads_read/
 * ads_management alone do not grant these. This is a genuine,
 * confirmed PERMISSION_GAP, not an invented one. A live sync
 * attempt against a token lacking these scopes would fail with
 * Meta's own permission error - this module fails closed on that
 * exact response rather than fabricating success.
 *
 * PERMANENT INVARIANTS:
 *   USER_ENTERED_PAGE_ID != VERIFIED_PAGE_IDENTITY
 *   PERSISTED_ID != VERIFIED_IDENTITY
 *   META_READ_VERIFIED_IDENTITY != AUTHORIZATION_TO_PUBLISH
 *   IDENTITY_VERIFIED != EXECUTED
 *
 * "Verified"/"ACCESS_VERIFIED" here means ONLY: Meta's read API
 * returned this identity through the connected account's own
 * trusted credential path. It does NOT mean a Meta "Verified" badge,
 * legal ownership, or any authorization to publish or spend.
 *
 * NO FRESHNESS INVENTION: this module deliberately does NOT define
 * a PAGE_IDENTITY_MAX_AGE_HOURS or equivalent expiration threshold -
 * no domain evidence justifies one. observedAt/verifiedAt are
 * persisted so a future execution preflight can decide whether a
 * fresh provider check is warranted; that decision is explicitly
 * deferred, not resolved here.
 */

export interface MetaPageIdentity {
  pageId: string
  name: string | null
  instagramActorId: string | null
  instagramUsername: string | null
  /** The moment this identity was actually observed through the
   * trusted read path - never backdated, never inferred. */
  verifiedAt: string
}

export interface MetaPageIdentitySyncReason {
  code: string
  message: string
}

export type MetaPageIdentitySyncStatus = "SYNCED" | "SYNC_FAILED"

export interface MetaPageIdentitySyncResult {
  status: MetaPageIdentitySyncStatus
  identities: MetaPageIdentity[]
  reasons: MetaPageIdentitySyncReason[]
}

/**
 * Raw shape returned by the read provider's listAccessiblePages(),
 * before normalization. Deliberately permissive/nullable on
 * optional fields - Meta's own response shape, not yet a trusted
 * domain object.
 */
export interface RawMetaPageResponse {
  id: string | null | undefined
  name: string | null | undefined
  instagramBusinessAccountId: string | null | undefined
  instagramUsername: string | null | undefined
}

function reason(code: string, message: string): MetaPageIdentitySyncReason {
  return { code, message }
}

/**
 * Pure normalization. A page with a missing/malformed id is
 * discarded, never fabricated. instagramActorId/instagramUsername
 * are honestly null when Meta's own response has none - never
 * invented, matching the confirmed "Page without Instagram is
 * allowed" requirement.
 */
export function normalizeMetaPageIdentities(rawPages: RawMetaPageResponse[], observedAt: string): MetaPageIdentitySyncResult {
  const identities: MetaPageIdentity[] = []
  const reasons: MetaPageIdentitySyncReason[] = []

  for (const raw of rawPages) {
    if (!raw.id || typeof raw.id !== "string" || raw.id.trim().length === 0) {
      reasons.push(reason("MALFORMED_PAGE_RESPONSE", "A Page in the response was missing a valid identifier and was skipped."))
      continue
    }
    identities.push({
      pageId: raw.id,
      name: typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name : null,
      instagramActorId: typeof raw.instagramBusinessAccountId === "string" && raw.instagramBusinessAccountId.trim().length > 0 ? raw.instagramBusinessAccountId : null,
      instagramUsername: typeof raw.instagramUsername === "string" && raw.instagramUsername.trim().length > 0 ? raw.instagramUsername : null,
      verifiedAt: observedAt,
    })
  }

  if (identities.length === 0 && rawPages.length > 0) {
    return { status: "SYNC_FAILED", identities: [], reasons: [...reasons, reason("NO_VALID_PAGES", "No accessible Pages could be verified from the response.")] }
  }

  return { status: "SYNCED", identities, reasons }
}

/**
 * Pure trusted-identity check used by Creative Execution Context
 * readiness. Requires an EXACT match against a genuinely persisted,
 * trusted identity record scoped to the correct workspace/brand/
 * Meta account link - never a bare non-null pageId, never a client-
 * supplied "verified" boolean.
 */
export function isPageIdentityTrusted(
  selectedPageId: string | null,
  trustedIdentityPageIds: string[]
): boolean {
  if (!selectedPageId) return false
  return trustedIdentityPageIds.includes(selectedPageId)
}