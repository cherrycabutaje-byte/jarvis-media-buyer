"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import {
  connectMetaAdAccount,
  disconnectMetaAdAccount,
  getMetaAdAccountLinkForBrand,
} from "@/lib/repositories/metaAdAccountRepository"

export interface ConnectMetaAdAccountResult {
  success: boolean
  error: string | null
  linkId: string | null
}

/**
 * Meta Ads Account Connection V1 (READ-ONLY) Server Action.
 *
 * CREDENTIAL SAFETY: the real access token passes through to the
 * connect_meta_ad_account() SECURITY DEFINER RPC exactly once, for
 * Supabase Vault to encrypt. Never logged, never returned in this
 * action's result, never stored in any plain column.
 *
 * NO EXECUTION CAPABILITY: only ever connects a read-only reporting
 * link. No campaign/ad-set/ad creation or spend-execution RPC
 * exists anywhere in this project.
 */
export async function connectMetaAdAccountAction(params: {
  brandId: string
  metaAdAccountId: string
  metaBusinessId: string | null
  accessToken: string
}): Promise<ConnectMetaAdAccountResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", linkId: null }
  }

  const brandResult = await getBrandById(params.brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", linkId: null }
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to connect an ad account for this business.", linkId: null }
  }

  if (!params.metaAdAccountId.trim() || !params.accessToken.trim()) {
    return { success: false, error: "An ad account ID and access token are both required.", linkId: null }
  }

  const result = await connectMetaAdAccount({
    workspaceId: brandResult.data.workspace_id,
    brandId: params.brandId,
    metaAdAccountId: params.metaAdAccountId.trim(),
    metaBusinessId: params.metaBusinessId?.trim() || null,
    accessToken: params.accessToken,
  })

  if (result.error) {
    return { success: false, error: result.error, linkId: null }
  }
  return { success: true, error: null, linkId: result.data }
}

export interface DisconnectMetaAdAccountResult {
  success: boolean
  error: string | null
}

export async function disconnectMetaAdAccountAction(brandId: string): Promise<DisconnectMetaAdAccountResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in." }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: false, error: linkResult.error ?? "No connected ad account found." }
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === linkResult.data!.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to disconnect this ad account." }
  }

  const result = await disconnectMetaAdAccount(linkResult.data.id)
  if (result.error) {
    return { success: false, error: result.error }
  }
  return { success: true, error: null }
}
