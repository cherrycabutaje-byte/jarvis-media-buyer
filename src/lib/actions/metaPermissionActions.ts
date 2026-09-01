"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getMetaAdAccountLinkForBrand, getMetaAdAccountCredential } from "@/lib/repositories/metaAdAccountRepository"
import { replacePermissionObservations, getPermissionObservationsForLink } from "@/lib/repositories/metaPermissionObservationRepository"
import { evaluateMetaIdentityPermissionCapability, type MetaIdentityPermissionCapabilityResult } from "@/lib/product/metaPermission"
import type { MetaPermissionProvider } from "@/lib/product/providers/metaPermissionProvider"

/**
 * Meta OAuth Permission Capability V1 slice.
 *
 * Inspects the CURRENT permissions actually granted to the brand's
 * connected Meta credential via Meta's own read-only permission-
 * inspection endpoint - never assumes ads_read implies Page access.
 * Accepts an explicit provider argument so automated tests can inject
 * a deterministic fake; production wiring uses LiveMetaPermissionProvider
 * (a genuine, real implementation - see metaPermissionProvider.ts).
 */
export interface CustomerFacingPermissionCapability extends MetaIdentityPermissionCapabilityResult {
  observedAt: string | null
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
 * Runs a fresh permission inspection for this brand's connected Meta
 * account link and persists the result as the new trusted snapshot.
 * A failed provider call NEVER writes a permission observation - the
 * previous trusted snapshot (if any) is left untouched, never
 * silently assumed still valid and never silently cleared either.
 */
export async function inspectMetaPermissionsAction(
  brandId: string,
  provider: MetaPermissionProvider
): Promise<{ success: boolean; error: string | null; capability: CustomerFacingPermissionCapability | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {    return { success: false, error: access.error, capability: null }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: false, error: "No Meta ad account is connected for this business.", capability: null }
  }

  const credentialResult = await getMetaAdAccountCredential(linkResult.data.id)
  if (credentialResult.error || !credentialResult.data) {
    return { success: false, error: "Could not access the Meta credential for this business.", capability: null }
  }

  const providerResult = await provider.getGrantedPermissions(credentialResult.data)
  if (!providerResult.success || !providerResult.data) {
    return {
      success: false,
      error:
        providerResult.error?.code === "AUTHENTICATION_ERROR"
          ? "The Meta credential is no longer valid and needs to be reconnected."
          : providerResult.error?.message ?? "Could not inspect Meta permissions.",
      capability: null,
    }
  }

  const observedAt = new Date().toISOString()
  const replaceResult = await replacePermissionObservations({
    workspaceId: access.workspaceId,
    brandId,
    metaAdAccountLinkId: linkResult.data.id,
    permissions: providerResult.data,
    observedAt,
  })
  if (replaceResult.error) {
    return { success: false, error: replaceResult.error, capability: null }
  }

  const capability = evaluateMetaIdentityPermissionCapability(providerResult.data)
  return { success: true, error: null, capability: { ...capability, observedAt } }
}

/**
 * Reads the brand's currently persisted (already-inspected)
 * permission capability - never a live call. If no observation has
 * ever been recorded for this link, both capabilities are honestly
 * UNKNOWN, never assumed CAPABLE or MISSING_PERMISSION.
 */
export async function getMetaPermissionCapabilityAction(
  brandId: string
): Promise<{ success: boolean; error: string | null; capability: CustomerFacingPermissionCapability | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, capability: null }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: true, error: null, capability: { pageIdentityRead: "UNKNOWN", instagramIdentityRead: "UNKNOWN", observedAt: null } }
  }

  const observationsResult = await getPermissionObservationsForLink(linkResult.data.id)
  if (observationsResult.error) {
    return { success: false, error: observationsResult.error, capability: null }
  }

  const rows = observationsResult.data ?? []
  if (rows.length === 0) {
    return { success: true, error: null, capability: { pageIdentityRead: "UNKNOWN", instagramIdentityRead: "UNKNOWN", observedAt: null } }
  }

  const permissions = rows
    .filter((r) => r.status === "granted" || r.status === "declined")
    .map((r) => ({ permission: r.permission, status: r.status as "granted" | "declined" }))
  const capability = evaluateMetaIdentityPermissionCapability(permissions)
  const observedAt = rows[0]?.observed_at ?? null

  return { success: true, error: null, capability: { ...capability, observedAt } }
}