"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getActionSpecificationById } from "@/lib/repositories/actionSpecificationRepository"
import {
  createDraftCreativeExecutionContext,
  getCreativeExecutionContextById,
  updateDraftCreativeExecutionContext,
  finalizeCreativeExecutionContext,
  authorizeCreativeExecutionContext,
  declineCreativeExecutionContext,
  type StoredCreativeExecutionContext,
} from "@/lib/repositories/creativeExecutionContextRepository"
import {
  evaluateCreativeExecutionContextReadiness,
  validateContextAuthorization,
  type ContextReadinessResult,
  type CallToActionType,
  type CreativeExecutionContextStatus,
  type ContextAuthorizationDecisionType,
} from "@/lib/product/creativeExecutionContext"

/**
 * Creative Execution Context V1 slice.
 *
 * Server trust boundary (every function): authenticate -> authorize
 * workspace/brand -> independently load and verify the parent
 * specification server-side. The client supplies only IDs and the
 * material content fields it wants to set - never a trusted
 * ownership or verification claim. page_identity_verified is NEVER
 * settable by any function here - it stays honestly false, since no
 * trusted Page-ownership verification source exists in the current
 * architecture (see creativeExecutionContext.ts's module
 * documentation for the full finding).
 */

export interface CustomerFacingCreativeExecutionContext {
  id: string
  specificationId: string
  primaryText: string | null
  headline: string | null
  description: string | null
  destinationUrl: string | null
  callToActionType: string | null
  pageId: string | null
  pageIdentityVerified: boolean
  instagramActorId: string | null
  status: string
  createdAt: string
  decidedAt: string | null
  decidedBy: string | null
}

function toCustomerFacing(row: StoredCreativeExecutionContext): CustomerFacingCreativeExecutionContext {
  return {
    id: row.id,
    specificationId: row.specification_id,
    primaryText: row.primary_text,
    headline: row.headline,
    description: row.description,
    destinationUrl: row.destination_url,
    callToActionType: row.call_to_action_type,
    pageId: row.page_id,
    pageIdentityVerified: row.page_identity_verified,
    instagramActorId: row.instagram_actor_id,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  }
}

async function verifyBrandAccess(brandId: string): Promise<{ workspaceId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { error: "You must be logged in." }
  }
  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { error: brandResult.error ?? "Business not found." }
  }
  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return { error: "You are not authorized to access this business." }
  }
  return { workspaceId: brandResult.data.workspace_id, userId: userData.user.id }
}

/**
 * Creates a DRAFT context bound to exactly one persisted
 * specification belonging to this exact brand. Never requires the
 * specification to already be AUTHORIZED - a context can be
 * prepared alongside specification preparation, but its own
 * authorization is entirely independent.
 */
export async function createDraftCreativeExecutionContextAction(
  brandId: string,
  specificationId: string
): Promise<{ success: boolean; error: string | null; context: CustomerFacingCreativeExecutionContext | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, context: null }
  }

  const specResult = await getActionSpecificationById(specificationId)
  if (specResult.error || !specResult.data) {
    return { success: false, error: "That specification could not be found.", context: null }
  }
  if (specResult.data.brand_id !== brandId) {
    return { success: false, error: "That specification does not belong to this business.", context: null }
  }

  const insertResult = await createDraftCreativeExecutionContext({
    workspaceId: access.workspaceId,
    brandId,
    specificationId,
    createdBy: access.userId,
  })
  if (insertResult.error || !insertResult.data) {
    return { success: false, error: insertResult.error ?? "Could not create the ad content.", context: null }
  }

  return { success: true, error: null, context: toCustomerFacing(insertResult.data) }
}

/**
 * Updates a DRAFT context's material fields. page_identity_verified
 * can never be set through this function - it is never accepted as
 * a client-suppliable field at all.
 */
export async function updateDraftCreativeExecutionContextAction(
  brandId: string,
  contextId: string,
  updates: {
    primaryText?: string | null
    headline?: string | null
    description?: string | null
    destinationUrl?: string | null
    callToActionType?: CallToActionType | null
    pageId?: string | null
    instagramActorId?: string | null
  }
): Promise<{ success: boolean; error: string | null; context: CustomerFacingCreativeExecutionContext | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, context: null }
  }

  const contextResult = await getCreativeExecutionContextById(contextId)
  if (contextResult.error || !contextResult.data) {
    return { success: false, error: "That ad content could not be found.", context: null }
  }
  if (contextResult.data.brand_id !== brandId) {
    return { success: false, error: "That ad content does not belong to this business.", context: null }
  }
  if (contextResult.data.status !== "DRAFT") {
    return { success: false, error: "This ad content has already been finalized and cannot be changed.", context: null }
  }

  const updateResult = await updateDraftCreativeExecutionContext(contextId, updates)
  if (updateResult.error || !updateResult.data) {
    return { success: false, error: updateResult.error ?? "Could not update the ad content.", context: null }
  }

  return { success: true, error: null, context: toCustomerFacing(updateResult.data) }
}

/**
 * Finalizes a DRAFT into READY_FOR_OWNER_AUTHORIZATION, only if
 * evaluateCreativeExecutionContextReadiness() genuinely returns
 * READY. page_identity_verified is read directly from the trusted
 * persisted row (never client-supplied), and is honestly false for
 * every real context in V1.
 */
export async function finalizeCreativeExecutionContextAction(
  brandId: string,
  contextId: string
): Promise<{ success: boolean; error: string | null; context: CustomerFacingCreativeExecutionContext | null; readiness: ContextReadinessResult | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, context: null, readiness: null }
  }

  const contextResult = await getCreativeExecutionContextById(contextId)
  if (contextResult.error || !contextResult.data) {
    return { success: false, error: "That ad content could not be found.", context: null, readiness: null }
  }
  if (contextResult.data.brand_id !== brandId) {
    return { success: false, error: "That ad content does not belong to this business.", context: null, readiness: null }
  }

  const readiness = evaluateCreativeExecutionContextReadiness({
    specificationId: contextResult.data.specification_id,
    primaryText: contextResult.data.primary_text,
    headline: contextResult.data.headline,
    description: contextResult.data.description,
    destinationUrl: contextResult.data.destination_url,
    callToActionType: contextResult.data.call_to_action_type,
    pageId: contextResult.data.page_id,
    pageIdentityVerified: contextResult.data.page_identity_verified,
    instagramActorId: contextResult.data.instagram_actor_id,
  })

  if (readiness.status !== "READY") {
    return { success: true, error: null, context: toCustomerFacing(contextResult.data), readiness }
  }

  const finalizeResult = await finalizeCreativeExecutionContext(contextId)
  if (finalizeResult.error || !finalizeResult.data) {
    return { success: false, error: finalizeResult.error ?? "Could not finalize the ad content.", context: null, readiness }
  }

  return { success: true, error: null, context: toCustomerFacing(finalizeResult.data), readiness }
}

/**
 * Records the owner's explicit, entirely independent authorization
 * decision on this ad content - never reusing or reinterpreting the
 * parent specification's own decided_at/decided_by.
 */
export async function decideCreativeExecutionContextAuthorizationAction(
  brandId: string,
  contextId: string,
  decision: ContextAuthorizationDecisionType
): Promise<{ success: boolean; error: string | null; context: CustomerFacingCreativeExecutionContext | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, context: null }
  }

  const contextResult = await getCreativeExecutionContextById(contextId)
  if (contextResult.error || !contextResult.data) {
    return { success: false, error: "That ad content could not be found.", context: null }
  }
  if (contextResult.data.brand_id !== brandId) {
    return { success: false, error: "That ad content does not belong to this business.", context: null }
  }

  const transitionCheck = validateContextAuthorization(contextResult.data.status as CreativeExecutionContextStatus, decision)
  if (!transitionCheck.valid) {
    return { success: false, error: transitionCheck.reason ?? "This ad content cannot be decided.", context: null }
  }

  const result =
    decision === "AUTHORIZE"
      ? await authorizeCreativeExecutionContext(contextId, access.userId)
      : await declineCreativeExecutionContext(contextId, access.userId)

  if (result.error || !result.data) {
    return { success: false, error: result.error ?? "Could not record your decision. It may have already been decided.", context: null }
  }

  return { success: true, error: null, context: toCustomerFacing(result.data) }
}