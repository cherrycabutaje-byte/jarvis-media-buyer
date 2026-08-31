"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getActionProposalById } from "@/lib/repositories/actionProposalRepository"
import { getMetaAdAccountLinkForBrand } from "@/lib/repositories/metaAdAccountRepository"
import { getCreativeAssetById } from "@/lib/repositories/creativeAssetRepository"
import {
  createDraftSpecification,
  getActionSpecificationById,
  updateDraftSpecification,
  finalizeSpecification,
  authorizeSpecification,
  declineSpecification,
  listSyncedEntitiesForLink,
  type StoredActionSpecification,
} from "@/lib/repositories/actionSpecificationRepository"
import {
  evaluateSpecificationReadiness,
  validateConcreteAuthorization,
  type SpecificationReadinessResult,
  type SpecificationActionType,
  type SpecificationStatus,
  type AuthorizationDecisionType,
} from "@/lib/product/concreteActionSpecification"
import { evaluateProposedMediaAction, type OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import { evaluateAuthorizedSpecificationExecutionEligibility } from "@/lib/product/concreteActionSpecification"
import { buildMetaExecutionPlan, type ExecutionPlanResult, type CreativeAssetForPlanning } from "@/lib/product/metaExecutionPlan"
import { getCreativeExecutionContextsForSpecification } from "@/lib/repositories/creativeExecutionContextRepository"

/**
 * Concrete Action Specification V1 slice.
 *
 * Server trust boundary (every function): authenticate -> authorize
 * workspace/brand -> independently load and verify every referenced
 * resource (proposal, Meta account, target, creative, guardrails)
 * server-side. The client supplies only IDs/selections - never a
 * trusted value. No specification is ever finalized based on a
 * client-asserted proposal status, spend, target, creative, or
 * account.
 */

export interface CustomerFacingSpecification {
  id: string
  proposalId: string
  actionType: string
  metaAdAccountId: string | null
  targetEntityType: string | null
  targetEntityId: string | null
  creativeAssetId: string | null
  proposedSpendCents: number | null
  currency: string | null
  status: string
  createdAt: string
  finalizedAt: string | null
  decidedAt: string | null
  decidedBy: string | null
}

function toCustomerFacing(row: StoredActionSpecification): CustomerFacingSpecification {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    actionType: row.action_type,
    metaAdAccountId: row.meta_ad_account_id,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    creativeAssetId: row.creative_asset_id,
    proposedSpendCents: row.proposed_spend_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
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
 * Creates a DRAFT specification bound to exactly one persisted,
 * APPROVED proposal belonging to this exact brand. The Meta ad
 * account is derived server-side from the brand's trusted link -
 * never accepted from the client. Fails closed on any proposal * status other than APPROVED, and on any action-type mismatch.
 */
export async function createDraftSpecificationAction(
  brandId: string,
  proposalId: string
): Promise<{ success: boolean; error: string | null; specification: CustomerFacingSpecification | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, specification: null }
  }

  const proposalResult = await getActionProposalById(proposalId)
  if (proposalResult.error || !proposalResult.data) {
    return { success: false, error: "That proposal could not be found.", specification: null }
  }
  if (proposalResult.data.brand_id !== brandId) {
    return { success: false, error: "That proposal does not belong to this business.", specification: null }
  }
  if (proposalResult.data.status !== "APPROVED") {
    return { success: false, error: "Only an approved proposal can become a concrete specification.", specification: null }
  }
  if (proposalResult.data.category === "OBSERVATION") {
    return { success: false, error: "This proposal is informational and cannot become a concrete specification.", specification: null }
  }
  // V1 supports exactly one action type - fail closed on anything else.
  if (proposalResult.data.solution_candidate_code !== "TEST_ALTERNATIVE_CREATIVE") {
    return { success: false, error: "This type of proposal is not yet supported for a concrete specification.", specification: null }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  const metaAdAccountId = linkResult.data ? linkResult.data.meta_ad_account_id : null

  const insertResult = await createDraftSpecification({
    workspaceId: access.workspaceId,
    brandId,
    proposalId,
    actionType: proposalResult.data.solution_candidate_code as SpecificationActionType,
    metaAdAccountId,
    createdBy: access.userId,
  })
  if (insertResult.error || !insertResult.data) {
    return { success: false, error: insertResult.error ?? "Could not create the specification.", specification: null }
  }

  return { success: true, error: null, specification: toCustomerFacing(insertResult.data) }
}

/**
 * Lists the exact Meta entities genuinely synced for this brand's
 * connected account, at the AD_SET grain - the narrowest correct
 * placement target inspected in the current architecture for
 * TEST_ALTERNATIVE_CREATIVE. Returns an honestly empty list if no
 * ad-set-level data has ever been synced - never an invented ID.
 */
export async function listAvailableTargetsAction(brandId: string): Promise<{ success: boolean; error: string | null; targetIds: string[] }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, targetIds: [] }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: true, error: null, targetIds: [] }
  }

  const idsResult = await listSyncedEntitiesForLink(linkResult.data.id, "AD_SET")
  if (idsResult.error) {
    return { success: false, error: idsResult.error, targetIds: [] }
  }
  return { success: true, error: null, targetIds: idsResult.data ?? [] }
}

/**
 * Updates a DRAFT specification's target/creative/spend selections.
 * Every referenced resource is independently re-verified server-side
 * before being persisted - a forged cross-brand target/creative can
 * never be accepted merely because the client asserted it.
 */
export async function updateDraftSpecificationAction(
  brandId: string,
  specificationId: string,
  updates: { targetEntityId?: string | null; creativeAssetId?: string | null; proposedSpendCents?: number | null }
): Promise<{ success: boolean; error: string | null; specification: CustomerFacingSpecification | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, specification: null }
  }

  const specResult = await getActionSpecificationById(specificationId)
  if (specResult.error || !specResult.data) {
    return { success: false, error: "That specification could not be found.", specification: null }
  }
  if (specResult.data.brand_id !== brandId) {
    return { success: false, error: "That specification does not belong to this business.", specification: null }
  }
  if (specResult.data.status !== "DRAFT") {
    return { success: false, error: "This specification has already been finalized and cannot be changed.", specification: null }
  }

  const patch: { targetEntityType?: string | null; targetEntityId?: string | null; creativeAssetId?: string | null; proposedSpendCents?: number | null; currency?: string | null } = {}

  if (updates.targetEntityId !== undefined) {
    if (updates.targetEntityId === null) {
      patch.targetEntityType = null
      patch.targetEntityId = null
    } else {
      const linkResult = await getMetaAdAccountLinkForBrand(brandId)
      if (!linkResult.data) {
        return { success: false, error: "No Meta ad account is connected for this business.", specification: null }
      }
      const idsResult = await listSyncedEntitiesForLink(linkResult.data.id, "AD_SET")
      const verified = (idsResult.data ?? []).includes(updates.targetEntityId)
      if (!verified) {
        return { success: false, error: "That target is not available for this business.", specification: null }
      }
      patch.targetEntityType = "AD_SET"
      patch.targetEntityId = updates.targetEntityId
    }
  }

  if (updates.creativeAssetId !== undefined) {
    if (updates.creativeAssetId === null) {
      patch.creativeAssetId = null
    } else {
      const assetResult = await getCreativeAssetById(updates.creativeAssetId)
      if (assetResult.error || !assetResult.data) {
        return { success: false, error: "That creative could not be found.", specification: null }
      }
      if (assetResult.data.workspace_id !== access.workspaceId || (assetResult.data.brand_id !== null && assetResult.data.brand_id !== brandId)) {
        return { success: false, error: "That creative does not belong to this business.", specification: null }
      }
      patch.creativeAssetId = updates.creativeAssetId
    }
  }

  if (updates.proposedSpendCents !== undefined) {
    patch.proposedSpendCents = updates.proposedSpendCents
    // Currency is server-controlled, sourced from the brand's own
    // trusted budget configuration - never accepted from the client,
    // never allowed to be arbitrarily switched.
    if (updates.proposedSpendCents !== null) {
      const brandResult = await getBrandById(brandId)
      patch.currency = brandResult.data ? brandResult.data.budget_currency : null
    }
  }

  const updateResult = await updateDraftSpecification(specificationId, patch)
  if (updateResult.error || !updateResult.data) {
    return { success: false, error: updateResult.error ?? "Could not update the specification.", specification: null }
  }

  return { success: true, error: null, specification: toCustomerFacing(updateResult.data) }
}

/**
 * Lists creative assets available for selection, scoped exactly to
 * this brand's own workspace/brand/product boundary - never another
 * brand's assets.
 */
export async function listAvailableCreativeAssetsAction(
  brandId: string
): Promise<{ success: boolean; error: string | null; assets: Array<{ id: string; category: string; originalFilename: string | null }> }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, assets: [] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_assets")
    .select("id, category, original_filename, brand_id")
    .eq("workspace_id", access.workspaceId)
    .or(`brand_id.eq.${brandId},brand_id.is.null`)
    .order("created_at", { ascending: false })

  if (error) {
    return { success: false, error: error.message, assets: [] }
  }

  return {
    success: true,
    error: null,
    assets: (data ?? []).map((row) => ({ id: row.id as string, category: row.category as string, originalFilename: row.original_filename as string | null })),
  }
}

/**
 * Finalizes a DRAFT into READY_FOR_OWNER_AUTHORIZATION, ONLY if
 * evaluateSpecificationReadiness() genuinely returns READY. Every
 * input to that evaluation is independently loaded/verified
 * server-side in this function - never trusted from the client.
 *
 * READY_FOR_OWNER_AUTHORIZATION is explicitly NOT execution
 * authorization - Concrete Owner Authorization is a future slice,
 * not built here. This function never grants any further status.
 */
export async function finalizeSpecificationAction(
  brandId: string,
  specificationId: string
): Promise<{ success: boolean; error: string | null; specification: CustomerFacingSpecification | null; readiness: SpecificationReadinessResult | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, specification: null, readiness: null }
  }

  const specResult = await getActionSpecificationById(specificationId)
  if (specResult.error || !specResult.data) {
    return { success: false, error: "That specification could not be found.", specification: null, readiness: null }
  }
  if (specResult.data.brand_id !== brandId) {
    return { success: false, error: "That specification does not belong to this business.", specification: null, readiness: null }
  }

  const proposalResult = await getActionProposalById(specResult.data.proposal_id)
  if (proposalResult.error || !proposalResult.data) {
    return { success: false, error: "The proposal behind this specification could not be found.", specification: null, readiness: null }
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", specification: null, readiness: null }
  }
  const currentGuardrails: OwnerGuardrails = {
    authorityMode: (brandResult.data.authority_mode as OwnerGuardrails["authorityMode"]) ?? null,
    currency: brandResult.data.budget_currency,
    monthlyBudgetCents: brandResult.data.monthly_budget_cents,
    dailyMaximumCents: brandResult.data.daily_maximum_cents,
    maxTestBudgetCents: brandResult.data.max_test_budget_cents,
  }

  let creativeAssetOwnershipVerified = false
  if (specResult.data.creative_asset_id) {
    const assetResult = await getCreativeAssetById(specResult.data.creative_asset_id)
    creativeAssetOwnershipVerified =
      !assetResult.error &&
      !!assetResult.data &&
      assetResult.data.workspace_id === access.workspaceId &&
      (assetResult.data.brand_id === null || assetResult.data.brand_id === brandId)
  }

  let targetEntityOwnershipVerified = false
  if (specResult.data.target_entity_id && specResult.data.target_entity_type) {
    const linkResult = await getMetaAdAccountLinkForBrand(brandId)
    if (linkResult.data) {
      const idsResult = await listSyncedEntitiesForLink(linkResult.data.id, specResult.data.target_entity_type)
      targetEntityOwnershipVerified = (idsResult.data ?? []).includes(specResult.data.target_entity_id)
    }
  }

  const readiness = evaluateSpecificationReadiness({
    proposal: {
      status: proposalResult.data.status as "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED",
      solutionCandidateCode: proposalResult.data.solution_candidate_code,
      category: proposalResult.data.category,
      workspaceId: proposalResult.data.workspace_id,
      brandId: proposalResult.data.brand_id,
    },
    draft: {
      actionType: specResult.data.action_type as SpecificationActionType,
      metaAdAccountId: specResult.data.meta_ad_account_id,
      targetEntityType: specResult.data.target_entity_type,
      targetEntityId: specResult.data.target_entity_id,
      creativeAssetId: specResult.data.creative_asset_id,
      proposedSpendCents: specResult.data.proposed_spend_cents,
      currency: specResult.data.currency,
    },
    creativeAssetOwnershipVerified,
    targetEntityOwnershipVerified,
    maxAuthorizedSpendCents: currentGuardrails.maxTestBudgetCents,
    currentGuardrails,
  })

  if (readiness.status !== "READY") {
    return { success: true, error: null, specification: toCustomerFacing(specResult.data), readiness }
  }

  const finalizeResult = await finalizeSpecification(specificationId)
  if (finalizeResult.error || !finalizeResult.data) {
    return { success: false, error: finalizeResult.error ?? "Could not finalize the specification.", specification: null, readiness }
  }

  return { success: true, error: null, specification: toCustomerFacing(finalizeResult.data), readiness }
}

/**
 * Concrete Owner Authorization V1 slice.
 *
 * Records an explicit human authorization decision on a READY
 * specification. Client supplies ONLY brandId/specificationId/
 * decision - never any execution-relevant field (spend, currency,
 * Meta account, target, creative, action type). Every one of those
 * is independently reloaded and revalidated server-side against the
 * CURRENT trusted state before AUTHORIZE can succeed.
 *
 * DECLINE requires only that the specification is genuinely READY -
 * it deliberately does NOT require the full revalidation gauntlet,
 * since declining always remains safe even when current guardrails
 * would block authorization (Section 8's explicit requirement).
 *
 * AUTHORIZE requires ALL of the following to hold against CURRENT,
 * freshly-reloaded state - not the specification's own possibly-
 * stale snapshot values used only for comparison:
 *   - parent proposal exists, belongs to the same brand, remains
 *     APPROVED
 *   - specification action type matches the proposal's own
 *   - the brand's CURRENTLY linked Meta account matches exactly
 *     (no drift)
 *   - the exact target is still a trusted, locally synced entity
 *     for that account
 *   - the creative asset still exists and belongs to the correct
 *     workspace/brand
 *   - proposed spend is a valid positive integer
 *   - proposed spend does not exceed the CURRENT owner maximum
 *   - currency matches the CURRENT trusted brand configuration
 *   - the CURRENT guardrail re-evaluation is genuinely ALLOWED
 *
 * Any single failure fails the whole AUTHORIZE attempt closed - the
 * specification itself is NEVER mutated to fit new limits, and
 * nothing is silently retargeted to a drifted account.
 */
export async function decideSpecificationAuthorizationAction(
  brandId: string,
  specificationId: string,
  decision: AuthorizationDecisionType
): Promise<{ success: boolean; error: string | null; specification: CustomerFacingSpecification | null; blockers: string[] }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, specification: null, blockers: [] }
  }

  const specResult = await getActionSpecificationById(specificationId)
  if (specResult.error || !specResult.data) {
    return { success: false, error: "That specification could not be found.", specification: null, blockers: [] }
  }
  if (specResult.data.brand_id !== brandId) {
    return { success: false, error: "That specification does not belong to this business.", specification: null, blockers: [] }
  }

  const transitionCheck = validateConcreteAuthorization(specResult.data.status as SpecificationStatus, decision)
  if (!transitionCheck.valid) {
    return { success: false, error: transitionCheck.reason ?? "This specification cannot be decided.", specification: null, blockers: [] }
  }

  if (decision === "DECLINE") {
    const declineResult = await declineSpecification(specificationId, access.userId)
    if (declineResult.error || !declineResult.data) {
      return { success: false, error: declineResult.error ?? "Could not record your decision. It may have already been decided.", specification: null, blockers: [] }
    }
    return { success: true, error: null, specification: toCustomerFacing(declineResult.data), blockers: [] }
  }

  const proposalResult = await getActionProposalById(specResult.data.proposal_id)
  if (proposalResult.error || !proposalResult.data) {
    return { success: false, error: "The proposal behind this specification could not be found.", specification: null, blockers: [] }
  }
  if (proposalResult.data.brand_id !== brandId) {
    return { success: false, error: "This specification's proposal does not belong to this business.", specification: null, blockers: [] }
  }

  const blockers: string[] = []

  if (proposalResult.data.status !== "APPROVED") {
    blockers.push("The proposal behind this action is no longer approved.")
  }
  if (specResult.data.action_type !== proposalResult.data.solution_candidate_code) {
    blockers.push("This specification no longer matches the approved proposal's action.")
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", specification: null, blockers: [] }
  }
  const currentGuardrails: OwnerGuardrails = {
    authorityMode: (brandResult.data.authority_mode as OwnerGuardrails["authorityMode"]) ?? null,
    currency: brandResult.data.budget_currency,
    monthlyBudgetCents: brandResult.data.monthly_budget_cents,
    dailyMaximumCents: brandResult.data.daily_maximum_cents,
    maxTestBudgetCents: brandResult.data.max_test_budget_cents,
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  const currentMetaAdAccountId = linkResult.data ? linkResult.data.meta_ad_account_id : null
  if (!currentMetaAdAccountId || currentMetaAdAccountId !== specResult.data.meta_ad_account_id) {
    blockers.push("The connected Meta account has changed since this action was prepared.")
  }

  if (specResult.data.target_entity_id && specResult.data.target_entity_type && linkResult.data) {
    const idsResult = await listSyncedEntitiesForLink(linkResult.data.id, specResult.data.target_entity_type)
    if (!(idsResult.data ?? []).includes(specResult.data.target_entity_id)) {
      blockers.push("The selected target is no longer available for this business.")
    }
  } else {
    blockers.push("An exact target for this action has not been selected.")
  }

  if (specResult.data.creative_asset_id) {
    const assetResult = await getCreativeAssetById(specResult.data.creative_asset_id)
    const ok =
      !assetResult.error &&
      !!assetResult.data &&
      assetResult.data.workspace_id === access.workspaceId &&
      (assetResult.data.brand_id === null || assetResult.data.brand_id === brandId)
    if (!ok) {
      blockers.push("The selected creative could not be verified as belonging to this business.")
    }
  } else {
    blockers.push("No test creative has been selected.")
  }

  if (specResult.data.proposed_spend_cents === null || !Number.isInteger(specResult.data.proposed_spend_cents) || specResult.data.proposed_spend_cents <= 0) {
    blockers.push("The proposed test budget is not a valid positive amount.")
  } else if (currentGuardrails.maxTestBudgetCents !== null && specResult.data.proposed_spend_cents > currentGuardrails.maxTestBudgetCents) {
    blockers.push("The proposed test budget exceeds your currently configured maximum.")
  }

  if (!specResult.data.currency) {
    blockers.push("No currency has been set for the proposed spend.")
  } else if (currentGuardrails.currency !== null && specResult.data.currency !== currentGuardrails.currency) {
    blockers.push("The proposed currency no longer matches your configured budget currency.")
  }

  if (specResult.data.proposed_spend_cents !== null && specResult.data.currency !== null) {
    const guardrailResult = evaluateProposedMediaAction(
      { type: "TEST_SPEND", amountCents: specResult.data.proposed_spend_cents, currency: specResult.data.currency },
      currentGuardrails
    )
    if (guardrailResult.decision === "BLOCKED") {
      blockers.push("This action exceeds your currently configured budget limits.")
    } else if (guardrailResult.decision === "INSUFFICIENT_CONFIGURATION") {
      blockers.push("Your budget and authority settings are not fully configured to authorize this action.")
    }
  }

  if (blockers.length > 0) {
    return { success: false, error: "This action cannot currently be authorized.", specification: toCustomerFacing(specResult.data), blockers }
  }

  const authorizeResult = await authorizeSpecification(specificationId, access.userId)
  if (authorizeResult.error || !authorizeResult.data) {
    return { success: false, error: authorizeResult.error ?? "Could not record your authorization. It may have already been decided.", specification: null, blockers: [] }
  }

  return { success: true, error: null, specification: toCustomerFacing(authorizeResult.data), blockers: [] }
}

/**
 * Creative Execution Context V1 slice addition.
 *
 * Wires an AUTHORIZED specification + its own AUTHORIZED creative
 * execution context into buildMetaExecutionPlan() - the first
 * real caller of that pure function. The execution context's
 * material fields are only ever passed through if the context
 * itself is genuinely AUTHORIZED (never merely DRAFT or READY) -
 * an unauthorized context is treated identically to a missing one,
 * so its creative-metadata blockers still correctly apply.
 *
 * This does NOT weaken SPEND_MODEL_UNSUPPORTED - the specification's
 * own targetEntityType is passed through unchanged, so an AD_SET
 * target still triggers that finding exactly as before. Resolving
 * the creative-metadata blockers and resolving the spend-model
 * blocker are independent, and this function proves that
 * independence rather than hiding it.
 */
export async function buildExecutionPlanAction(
  brandId: string,
  specificationId: string
): Promise<{ success: boolean; error: string | null; result: ExecutionPlanResult | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, result: null }
  }

  const specResult = await getActionSpecificationById(specificationId)
  if (specResult.error || !specResult.data) {
    return { success: false, error: "That specification could not be found.", result: null }
  }
  if (specResult.data.brand_id !== brandId) {
    return { success: false, error: "That specification does not belong to this business.", result: null }
  }

  const proposalResult = await getActionProposalById(specResult.data.proposal_id)
  if (proposalResult.error || !proposalResult.data) {
    return { success: false, error: "The proposal behind this specification could not be found.", result: null }
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", result: null }
  }
  const currentGuardrails: OwnerGuardrails = {
    authorityMode: (brandResult.data.authority_mode as OwnerGuardrails["authorityMode"]) ?? null,
    currency: brandResult.data.budget_currency,
    monthlyBudgetCents: brandResult.data.monthly_budget_cents,
    dailyMaximumCents: brandResult.data.daily_maximum_cents,
    maxTestBudgetCents: brandResult.data.max_test_budget_cents,
  }
  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  const currentMetaAdAccountId = linkResult.data ? linkResult.data.meta_ad_account_id : null

  const gateResult = evaluateAuthorizedSpecificationExecutionEligibility(
    {
      status: specResult.data.status as SpecificationStatus,
      decidedAt: specResult.data.decided_at,
      decidedBy: specResult.data.decided_by,
      actionType: specResult.data.action_type as SpecificationActionType,
      metaAdAccountId: specResult.data.meta_ad_account_id,
      targetEntityType: specResult.data.target_entity_type,
      targetEntityId: specResult.data.target_entity_id,
      creativeAssetId: specResult.data.creative_asset_id,
      proposedSpendCents: specResult.data.proposed_spend_cents,
      currency: specResult.data.currency,
    },
    {
      status: proposalResult.data.status as "PENDING_OWNER_REVIEW" | "APPROVED" | "DECLINED" | "EXPIRED",
      solutionCandidateCode: proposalResult.data.solution_candidate_code,
      category: proposalResult.data.category,
      createdAt: proposalResult.data.created_at,
      decidedAt: proposalResult.data.decided_at,
      decidedBy: proposalResult.data.decided_by,
      entityType: proposalResult.data.entity_type,
      entityId: proposalResult.data.entity_id,
      maxAuthorizedSpendCents: proposalResult.data.max_authorized_spend_cents,
    },
    currentGuardrails,
    currentMetaAdAccountId
  )

  const contextsResult = await getCreativeExecutionContextsForSpecification(specificationId)
  const authorizedContext = (contextsResult.data ?? []).find((c) => c.status === "AUTHORIZED") ?? null

  const creativeForPlanning: CreativeAssetForPlanning | null = authorizedContext
    ? {
        id: specResult.data.creative_asset_id ?? "",
        mimeType: "",
        storagePath: "",
        primaryText: authorizedContext.primary_text,
        headline: authorizedContext.headline,
        description: authorizedContext.description,
        destinationUrl: authorizedContext.destination_url,
        callToActionType: authorizedContext.call_to_action_type,
        pageId: authorizedContext.page_id,
        instagramActorId: authorizedContext.instagram_actor_id,
      }
    : null

  const planResult = buildMetaExecutionPlan(
    {
      id: specResult.data.id,
      status: specResult.data.status as SpecificationStatus,
      decidedAt: specResult.data.decided_at,
      decidedBy: specResult.data.decided_by,
      actionType: specResult.data.action_type as SpecificationActionType,
      metaAdAccountId: specResult.data.meta_ad_account_id,
      targetEntityType: specResult.data.target_entity_type,
      targetEntityId: specResult.data.target_entity_id,
      proposedSpendCents: specResult.data.proposed_spend_cents,
      currency: specResult.data.currency,
    },
    gateResult,
    creativeForPlanning
  )

  return { success: true, error: null, result: planResult }
}