/**
 * Creative Execution Context V1.
 *
 * Resolves the missing ad-construction context discovered by the
 * Meta Execution Plan audit (uploadCreativeAsset/createAdCreative/
 * createAd require primary text, destination URL, call-to-action,
 * and Page identity - none of which exist on creative_assets or
 * action_specifications).
 *
 * SOURCE-AD REUSE FINDING: SOURCE_AD_REUSE_UNSUPPORTED. Confirmed by
 * inspecting src/lib/product/providers/metaAdsReadProvider.ts's own
 * MetaAdData interface - listAds() only ever captures { id,
 * adSetId, name, status, effectiveStatus }. No creative
 * configuration (copy, destination, CTA, Page identity) is ever
 * read or persisted anywhere in the current Meta read/sync
 * architecture. Option B (reuse an existing source ad's proven
 * configuration) is therefore not locally provable and is not
 * modeled. Option A (explicit owner-supplied context) is the only
 * safe V1 path.
 *
 * ARCHITECTURE CHOICE: a separate CreativeExecutionContext, with its
 * OWN independent READY -> AUTHORIZED/DECLINED decision, rather than
 * a new/superseding Concrete Action Specification. This avoids
 * duplicating the specification's own account/target/creative-ID/
 * spend/currency fields, keeps the two authorization decisions
 * (owner's approval of the ACTION vs owner's approval of the AD
 * CONTENT) independently auditable, and mirrors the same "dedicated
 * table, dedicated lifecycle" pattern already proven safe for
 * Concrete Action Specification V1 (its own table, separate from
 * Action Proposal). PERMANENT INVARIANT: the specification's own
 * decided_at/decided_by is NEVER reused or reinterpreted to imply
 * these new fields were covered by that earlier decision - this
 * module has its own, entirely independent authorization
 * provenance.
 *
 * PAGE IDENTITY - CONFIRMED STOP CONDITION: no trusted, persisted
 * source anywhere in the current architecture (brands table, Meta
 * account links, Meta read provider) proves Facebook Page ownership
 * or access. An owner-selected Page ID may be persisted as DRAFT
 * information, but pageIdentityVerified is honestly always false
 * from real server wiring in V1 - there is no verification mechanism
 * to set it true. This means every real context today correctly
 * fails readiness on MISSING_PAGE_IDENTITY_VERIFICATION, matching
 * the same "correct, honest V1 outcome" pattern already established
 * in every prior slice this session. The field exists on the input
 * contract (rather than being omitted) so a pure, in-memory
 * positive-control test fixture can prove the validator is not
 * hardcoded to always reject, without ever falsely claiming
 * verification in production code.
 *
 * PRIMARY TEXT / DESTINATION / CTA: all explicit, owner-supplied,
 * never AI-generated, never inherited from an unrelated asset.
 *
 * IMMUTABILITY: once READY_FOR_OWNER_AUTHORIZATION, every material
 * field (primaryText, headline, description, destinationUrl,
 * callToActionType, pageId, instagramActorId) is immutable - the
 * same atomic UPDATE...WHERE status = 'DRAFT' pattern already proven
 * for action_specifications enforces this at the repository layer.
 */

export type CreativeExecutionContextStatus = "DRAFT" | "READY_FOR_OWNER_AUTHORIZATION" | "AUTHORIZED" | "DECLINED" | "SUPERSEDED"

/** Narrow, typed set - not every Meta CTA value, only those
 * genuinely justified for a V1 creative test. Never an arbitrary
 * string. */
export type CallToActionType = "SHOP_NOW" | "LEARN_MORE" | "SIGN_UP" | "GET_OFFER" | "CONTACT_US"

export type ContextReadinessStatus = "READY" | "NOT_READY"

export interface ContextReason {
  code: string
  message: string
}

export interface ContextReadinessResult {
  status: ContextReadinessStatus
  reasons: ContextReason[]
}

const SUPPORTED_CTA_TYPES: ReadonlySet<string> = new Set<CallToActionType>(["SHOP_NOW", "LEARN_MORE", "SIGN_UP", "GET_OFFER", "CONTACT_US"])
const SUPPORTED_URL_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"])
/** A generous, storage-driven sanity bound (matching a typical text
 * column), never an invented marketing/character-count rule. */
const MAX_PRIMARY_TEXT_LENGTH = 5000

export interface CreativeExecutionContextInput {
  specificationId: string
  primaryText: string | null
  headline: string | null
  description: string | null
  destinationUrl: string | null
  callToActionType: string | null
  pageId: string | null
  /** Honestly always false from real server wiring in V1 - see
   * module documentation above. Only a pure test fixture ever sets
   * this true. */
  pageIdentityVerified: boolean
  instagramActorId: string | null
}

function reason(code: string, message: string): ContextReason {
  return { code, message }
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return SUPPORTED_URL_SCHEMES.has(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Pure, deterministic, read-only readiness evaluation. Prefers
 * returning ALL safely determinable blockers over stopping at the
 * first one, matching the same discipline already established
 * throughout this pipeline.
 */
export function evaluateCreativeExecutionContextReadiness(input: CreativeExecutionContextInput): ContextReadinessResult {
  const reasons: ContextReason[] = []

  if (!input.primaryText || input.primaryText.trim().length === 0) {
    reasons.push(reason("MISSING_PRIMARY_TEXT", "No primary ad text has been entered."))
  } else if (input.primaryText.length > MAX_PRIMARY_TEXT_LENGTH) {
    reasons.push(reason("PRIMARY_TEXT_TOO_LONG", "The primary ad text exceeds the maximum supported length."))
  }

  if (!input.destinationUrl) {
    reasons.push(reason("MISSING_DESTINATION_URL", "No destination URL has been entered."))
  } else if (!isValidUrl(input.destinationUrl)) {
    reasons.push(reason("INVALID_DESTINATION_URL", "The destination URL is not a valid, supported web address."))
  }

  if (!input.callToActionType) {
    reasons.push(reason("MISSING_CALL_TO_ACTION", "No call-to-action has been selected."))
  } else if (!SUPPORTED_CTA_TYPES.has(input.callToActionType)) {
    reasons.push(reason("UNSUPPORTED_CALL_TO_ACTION", "The selected call-to-action is not currently supported."))
  }

  if (!input.pageId) {
    reasons.push(reason("MISSING_PAGE_IDENTITY", "No Facebook Page has been selected."))
  } else if (!input.pageIdentityVerified) {
    reasons.push(reason("MISSING_PAGE_IDENTITY_VERIFICATION", "This Facebook Page could not be verified as belonging to this business."))
  }

  // instagramActorId, headline, description are all optional in V1 -
  // their absence never blocks readiness.

  if (reasons.length > 0) {
    return { status: "NOT_READY", reasons }
  }

  return { status: "READY", reasons: [] }
}

export type ContextAuthorizationDecisionType = "AUTHORIZE" | "DECLINE"

export interface ContextAuthorizationValidationResult {
  valid: boolean
  resultingStatus: "AUTHORIZED" | "DECLINED" | null
  reason: string | null
}

/**
 * Validates ONLY the state transition, mirroring the exact same
 * shape already proven for validateConcreteAuthorization - a
 * genuinely independent authorization decision for this context's
 * own material fields, never derived from or reused across the
 * specification's own decision.
 */
export function validateContextAuthorization(
  currentStatus: CreativeExecutionContextStatus,
  decision: ContextAuthorizationDecisionType
): ContextAuthorizationValidationResult {
  if (currentStatus !== "READY_FOR_OWNER_AUTHORIZATION") {
    return {
      valid: false,
      resultingStatus: null,
      reason: `This ad content is ${currentStatus.toLowerCase().replace(/_/g, " ")} and cannot be authorized or declined.`,
    }
  }
  return {
    valid: true,
    resultingStatus: decision === "AUTHORIZE" ? "AUTHORIZED" : "DECLINED",
    reason: null,
  }
}