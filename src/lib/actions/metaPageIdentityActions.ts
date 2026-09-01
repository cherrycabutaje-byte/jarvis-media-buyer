"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { getMetaAdAccountLinkForBrand, getMetaAdAccountCredential } from "@/lib/repositories/metaAdAccountRepository"
import {
  replaceTrustedPageIdentities,
  getTrustedPageIdentitiesForLink,
  getTrustedPageIdentity,
  type StoredMetaPageIdentity,
} from "@/lib/repositories/metaPageIdentityRepository"
import { normalizeMetaPageIdentities, type MetaPageIdentitySyncResult } from "@/lib/product/metaPageIdentity"
import { getPermissionObservationsForLink } from "@/lib/repositories/metaPermissionObservationRepository"
import { evaluateMetaIdentityPermissionCapability } from "@/lib/product/metaPermission"
import type { MetaPageIdentityReadProvider } from "@/lib/product/providers/metaPageIdentityReadProvider"

/**
 * Meta Page & Instagram Identity Read / Verification V1 slice.
 *
 * CONFIRMED PERMISSION GAP: no evidence exists anywhere in this
 * repository that the currently connected Meta token holds the
 * pages_show_list/instagram_basic permissions this sync requires -
 * see metaPageIdentity.ts's module documentation for the full
 * finding. This action accepts an injectable provider (never a live
 * implementation is wired here in V1) so it can be exercised with a
 * deterministic fake in tests without ever requiring or assuming a
 * working live Meta call. A genuine PERMISSION_ERROR from the
 * provider is surfaced honestly, never silently retried as success.
 *
 * Sync semantics: trusted Vault credential -> read provider ->
 * successful response -> normalize -> persist. A failed or malformed
 * response NEVER creates or updates a trusted identity - the
 * previous trusted snapshot for the link is only replaced once a
 * genuinely successful, normalized result exists.
 */
export interface CustomerFacingPageIdentity {
  pageId: string
  pageName: string | null
  instagramActorId: string | null
  instagramUsername: string | null
  observedAt: string
}

function toCustomerFacing(row: StoredMetaPageIdentity): CustomerFacingPageIdentity {
  return {
    pageId: row.page_id,
    pageName: row.page_name,
    instagramActorId: row.instagram_actor_id,
    instagramUsername: row.instagram_username,
    observedAt: row.observed_at,
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
 * Runs a fresh Page/Instagram identity sync for this brand's
 * connected Meta account link. Requires an explicit provider
 * argument - production wiring for a real provider is a separate,
 * not-yet-approved slice given the confirmed permission gap; tests
 * inject a deterministic fake.
 */
export async function syncTrustedPageIdentitiesAction(
  brandId: string,
  provider: MetaPageIdentityReadProvider
): Promise<{ success: boolean; error: string | null; identities: CustomerFacingPageIdentity[] }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, identities: [] }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: false, error: "No Meta ad account is connected for this business.", identities: [] }
  }

  const credentialResult = await getMetaAdAccountCredential(linkResult.data.id)
  if (credentialResult.error || !credentialResult.data) {
    return { success: false, error: "Could not access the Meta credential for this business.", identities: [] }
  }

  // Meta OAuth Permission Capability V1 integration: never attempt
  // the Page sync merely because a Meta account is connected (ads
  // access does not imply Page access) - require a genuinely
  // observed, currently CAPABLE permission first. UNKNOWN (never
  // yet inspected) and MISSING_PERMISSION both fail closed here,
  // exactly like a confirmed absence - the caller should run
  // inspectMetaPermissionsAction first.
  const observationsResult = await getPermissionObservationsForLink(linkResult.data.id)
  const observedPermissions = (observationsResult.data ?? [])
    .filter((r) => r.status === "granted" || r.status === "declined")
    .map((r) => ({ permission: r.permission, status: r.status as "granted" | "declined" }))
  const capability = evaluateMetaIdentityPermissionCapability(observationsResult.data === null ? null : observedPermissions)
  if (capability.pageIdentityRead !== "CAPABLE") {
    return {
      success: false,
      error: "JARVIS does not currently have permission to read Facebook Pages for this Meta connection. Run a permission check first.",
      identities: [],
    }
  }

  const pagesResult = await provider.listAccessiblePages(credentialResult.data)
  if (!pagesResult.success || !pagesResult.data) {
    const message =
      pagesResult.error?.code === "PERMISSION_ERROR"
        ? "JARVIS cannot verify Facebook Pages with the current Meta connection. Additional Meta permission/reconnection is required."
        : pagesResult.error?.message ?? "Could not read Facebook Pages from Meta."
    return { success: false, error: message, identities: [] }
  }

  const observedAt = new Date().toISOString()
  const withInstagram = await Promise.all(
    pagesResult.data.map(async (page) => {
      if (!page.id) return { id: page.id, name: page.name, instagramBusinessAccountId: null, instagramUsername: null }
      const igResult = await provider.getPageInstagramIdentity(credentialResult.data as string, page.id)
      return {
        id: page.id,
        name: page.name,
        instagramBusinessAccountId: igResult.success ? igResult.data?.instagramBusinessAccountId ?? null : null,
        instagramUsername: igResult.success ? igResult.data?.instagramUsername ?? null : null,
      }
    })
  )

  const normalized: MetaPageIdentitySyncResult = normalizeMetaPageIdentities(withInstagram, observedAt)
  if (normalized.status !== "SYNCED") {
    return { success: false, error: normalized.reasons.map((r) => r.message).join(" ") || "Could not verify any Facebook Pages.", identities: [] }
  }

  const replaceResult = await replaceTrustedPageIdentities({
    workspaceId: access.workspaceId,
    brandId,
    metaAdAccountLinkId: linkResult.data.id,
    identities: normalized.identities.map((i) => ({
      pageId: i.pageId,
      pageName: i.name,
      instagramActorId: i.instagramActorId,
      instagramUsername: i.instagramUsername,
      observedAt: i.verifiedAt,
    })),
  })
  if (replaceResult.error || !replaceResult.data) {
    return { success: false, error: replaceResult.error ?? "Could not save verified Page identities.", identities: [] }
  }

  return { success: true, error: null, identities: replaceResult.data.map(toCustomerFacing) }
}

/**
 * Lists the brand's currently trusted (already-synced) Page
 * identities - never a live call, purely a read of the persisted
 * trusted snapshot.
 */
export async function listTrustedPageIdentitiesAction(
  brandId: string
): Promise<{ success: boolean; error: string | null; identities: CustomerFacingPageIdentity[] }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, identities: [] }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: true, error: null, identities: [] }
  }

  const identitiesResult = await getTrustedPageIdentitiesForLink(linkResult.data.id)
  if (identitiesResult.error) {
    return { success: false, error: identitiesResult.error, identities: [] }
  }
  return { success: true, error: null, identities: (identitiesResult.data ?? []).map(toCustomerFacing) }
}

/**
 * Server-side trusted check: does this exact Page ID belong to a
 * genuinely persisted trusted identity for this brand's own Meta
 * account link? Never a bare non-null check, never trusts a
 * client-supplied "verified" claim.
 */
export async function isPageIdentityTrustedForBrandAction(brandId: string, pageId: string): Promise<{ trusted: boolean; error: string | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { trusted: false, error: access.error }
  }
  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { trusted: false, error: null }
  }
  const identityResult = await getTrustedPageIdentity(linkResult.data.id, pageId)
  if (identityResult.error) {
    return { trusted: false, error: identityResult.error }
  }
  return { trusted: identityResult.data !== null, error: null }
}