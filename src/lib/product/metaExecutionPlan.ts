/**
 * Meta Execution Plan / Provider Contract V1.
 *
 * Defines the deterministic translation from an AUTHORIZED +
 * EXECUTABLE TEST_ALTERNATIVE_CREATIVE specification into the exact
 * sequence of FUTURE Meta Marketing API write operations required
 * to carry it out. This module performs ZERO live Meta calls, ZERO
 * asset uploads, ZERO ad/creative creation, and ZERO spend.
 *
 * PERMANENT INVARIANT: EXECUTABLE != EXECUTED. Reaching PLAN_READY
 * only means a valid, well-formed future mutation sequence CAN be
 * described - it is never itself an execution, and never enqueues
 * one.
 *
 * TWO GENUINE, CURRENTLY-UNRESOLVED ARCHITECTURAL GAPS (found by
 * inspection, not invented) mean every real specification in the
 * system today correctly yields PLAN_UNAVAILABLE:
 *
 * 1. SPEND MODEL MISMATCH (STOP-level finding): Meta's Marketing API
 *    does not support a per-ad guaranteed budget. Budget is
 *    controlled at the Campaign level (Campaign Budget
 *    Optimization) or the Ad Set level (ad set daily/lifetime
 *    budget) - never at the individual Ad level. Inserting a new ad
 *    into an EXISTING, already-running AD_SET means Meta's own
 *    delivery/auction system dynamically distributes that ad set's
 *    shared budget across every active ad within it. There is no
 *    Marketing API mechanism by which JARVIS could insert one more
 *    ad into an existing ad set and guarantee that ad alone spends
 *    exactly proposedSpendCents - the ad set's total budget, however
 *    it is configured, is shared and algorithmically distributed.
 *    This means the CURRENT execution strategy implied by targeting
 *    an existing AD_SET (Option A) cannot honor proposedSpendCents
 *    as a real, enforceable ceiling for the new creative alone.
 *    Resolving this requires a genuinely different execution
 *    strategy (e.g., a dedicated new ad set with its own budget,
 *    Option B) - a decision this slice does NOT make, since it
 *    requires its own dedicated specification/authorization design
 *    (a new ad set is a materially different, larger side effect
 *    than "add a creative to an approved target").
 *
 * 2. CREATIVE/COPY INSUFFICIENCY (STOP-level finding): Meta's Ad
 *    Creative object (required before any Ad can be created)
 *    requires, at minimum: a Facebook Page ID (and optionally an
 *    Instagram actor ID), primary text/body, a destination URL, and
 *    a call-to-action type - in addition to the image/video asset
 *    itself. JARVIS's creative_assets table stores only the raw
 *    media file (storage_path, mime_type, dimensions, category,
 *    lineage) - it has no field for primary text, headline,
 *    description, destination URL, call-to-action type, or Page/
 *    Instagram identity. The Concrete Action Specification itself
 *    also carries none of these. Neither table can be silently
 *    borrowed from without an explicit design decision (e.g. a
 *    sourceAdId to copy proven copy/destination/CTA from), which
 *    this slice does not invent.
 *
 * Both gaps are reported as PLAN_UNAVAILABLE reasons below, never
 * silently worked around. Every field these gaps concern exists on
 * the input CONTRACT as nullable (matching the same pattern already
 * established in executionGate.ts and concreteActionSpecification.ts)
 * so a pure, in-memory positive-control test fixture can prove the
 * builder is not hardcoded to always reject, without touching
 * production code or inventing real data.
 */

import type { ExecutionEligibilityResult } from "@/lib/product/executionGate"

/** Confirmed from src/lib/product/providers/metaAdsReadProvider.ts -
 * "Marketing API v26.0, current as of end of July 2026". Never
 * silently upgraded here. */
export const META_MARKETING_API_VERSION = "v26.0"

export type ExecutionPlanStatus = "PLAN_READY" | "PLAN_UNAVAILABLE"

export interface ExecutionPlanReason {
  code: string
  message: string
}

export type MetaExecutionOperationType = "UPLOAD_CREATIVE_ASSET" | "CREATE_AD_CREATIVE" | "CREATE_AD"

export interface MetaExecutionOperation {
  step: number
  operation: MetaExecutionOperationType
  description: string
  /** Meta's own initial delivery-safety state, applied at creation
   * time so a newly created object never begins spending before a
   * future orchestrator confirms every step succeeded. Only
   * populated on the CREATE_AD step. */
  initialStatus?: "PAUSED"
}

export interface MetaExecutionPlan {
  specificationId: string
  metaAdAccountId: string
  apiVersion: string
  operations: MetaExecutionOperation[]
}

export interface ExecutionPlanResult {
  status: ExecutionPlanStatus
  plan: MetaExecutionPlan | null
  reasons: ExecutionPlanReason[]
}

/**
 * Trusted, persisted, AUTHORIZED specification fields - fetched
 * server-side by a future caller, never client-supplied.
 */
export interface AuthorizedSpecificationForPlanning {
  id: string
  status: "DRAFT" | "READY_FOR_OWNER_AUTHORIZATION" | "AUTHORIZED" | "DECLINED" | "SUPERSEDED"
  decidedAt: string | null
  decidedBy: string | null
  actionType: string
  metaAdAccountId: string | null
  targetEntityType: string | null
  targetEntityId: string | null
  proposedSpendCents: number | null
  currency: string | null
}

/**
 * Trusted creative asset fields - fetched server-side. Fields that
 * genuinely do not exist anywhere in the current creative_assets
 * schema (primaryText, headline, description, destinationUrl,
 * callToActionType, pageId, instagramActorId) are modeled here as
 * always-nullable, since a future slice may add them - they are
 * always null when wired from real data today.
 */
export interface CreativeAssetForPlanning {
  id: string
  mimeType: string
  storagePath: string
  /** Not currently persisted anywhere - always null from real data. */
  primaryText: string | null
  /** Not currently persisted anywhere - always null from real data. */
  headline: string | null
  /** Not currently persisted anywhere - always null from real data. */
  description: string | null
  /** Not currently persisted anywhere - always null from real data. */
  destinationUrl: string | null
  /** Not currently persisted anywhere - always null from real data. */
  callToActionType: string | null
  /** Not currently persisted anywhere - always null from real data. */
  pageId: string | null
  /** Not currently persisted anywhere - always null from real data. */
  instagramActorId: string | null
}

function reason(code: string, message: string): ExecutionPlanReason {
  return { code, message }
}

/**
 * Pure, deterministic, read-only plan construction. Never calls
 * Meta, never uploads anything, never creates anything, never
 * enqueues an execution job, never spends money. Requires the
 * specification to be genuinely AUTHORIZED with valid provenance,
 * the Execution Safety Gate result to be genuinely EXECUTABLE, and
 * the action to be the one supported type - then evaluates the two
 * architectural gaps above against the actual creative data
 * supplied.
 */
export function buildMetaExecutionPlan(
  specification: AuthorizedSpecificationForPlanning,
  gateResult: ExecutionEligibilityResult,
  creative: CreativeAssetForPlanning | null
): ExecutionPlanResult {
  if (specification.status !== "AUTHORIZED") {
    return {
      status: "PLAN_UNAVAILABLE",
      plan: null,
      reasons: [reason("SPECIFICATION_NOT_AUTHORIZED", "This exact action has not been authorized by the owner.")],
    }
  }
  if (!specification.decidedBy || !specification.decidedAt) {
    return {
      status: "PLAN_UNAVAILABLE",
      plan: null,
      reasons: [reason("INVALID_AUTHORIZATION_PROVENANCE", "This specification's authorization record is incomplete and cannot be trusted.")],
    }
  }
  if (specification.actionType !== "TEST_ALTERNATIVE_CREATIVE") {
    return {
      status: "PLAN_UNAVAILABLE",
      plan: null,
      reasons: [reason("UNSUPPORTED_ACTION", "This action type does not yet have a supported execution plan.")],
    }
  }
  if (gateResult.status !== "EXECUTABLE") {
    return {
      status: "PLAN_UNAVAILABLE",
      plan: null,
      reasons: [reason("GATE_NOT_EXECUTABLE", "This action is not currently eligible for execution.")],
    }
  }

  const reasons: ExecutionPlanReason[] = []

  // SPEND MODEL MISMATCH - see module documentation above. Genuinely
  // unresolved for any AD_SET-targeted creative test in V1.
  if (specification.targetEntityType === "AD_SET") {
    reasons.push(
      reason(
        "SPEND_MODEL_UNSUPPORTED",
        "Meta does not support a guaranteed per-ad budget within an existing ad set - the proposed test spend cannot be enforced for this creative alone."
      )
    )
  }

  if (!creative) {
    reasons.push(reason("MISSING_CREATIVE_METADATA", "No creative asset information was supplied."))
  } else {
    if (!creative.primaryText) {
      reasons.push(reason("MISSING_CREATIVE_COPY", "No primary ad text has been set for this creative."))
    }
    if (!creative.destinationUrl) {
      reasons.push(reason("MISSING_DESTINATION_URL", "No destination URL has been set for this creative."))
    }
    if (!creative.callToActionType) {
      reasons.push(reason("MISSING_CALL_TO_ACTION", "No call-to-action has been set for this creative."))
    }
    if (!creative.pageId) {
      reasons.push(reason("MISSING_PAGE_IDENTITY", "No Facebook Page identity has been configured for this business."))
    }
  }

  if (reasons.length > 0) {
    return { status: "PLAN_UNAVAILABLE", plan: null, reasons }
  }

  // From here, every required field is genuinely present - this
  // path is only reachable by an in-memory positive-control test
  // fixture in V1, never by real production data.
  const operations: MetaExecutionOperation[] = [
    { step: 1, operation: "UPLOAD_CREATIVE_ASSET", description: "Upload the JARVIS creative asset's media file to Meta." },
    { step: 2, operation: "CREATE_AD_CREATIVE", description: "Create a Meta Ad Creative referencing the uploaded media, primary text, destination URL, and call-to-action." },
    { step: 3, operation: "CREATE_AD", description: "Create a new Ad in the authorized ad set, referencing the created Ad Creative.", initialStatus: "PAUSED" },
  ]
  return {
    status: "PLAN_READY",
    plan: {
      specificationId: specification.id,
      metaAdAccountId: specification.metaAdAccountId ?? "",
      apiVersion: META_MARKETING_API_VERSION,
      operations,
    },
    reasons: [],
  }
}