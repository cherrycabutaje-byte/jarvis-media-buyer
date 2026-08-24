import { createClient } from "@/lib/supabase/server"

export interface MetaAdAccountLink {
  id: string
  workspace_id: string
  brand_id: string
  meta_ad_account_id: string
  meta_business_id: string | null
  status: "connected" | "disconnected" | "error"
  connected_by: string | null
  connected_at: string | null
  last_synced_at: string | null
  last_sync_error: string | null
  created_at: string
  updated_at: string
}

export interface MetaAdAccountSyncSnapshot {
  id: string
  meta_ad_account_link_id: string
  synced_at: string
  campaigns: unknown[]
  ad_sets: unknown[]
  ads: unknown[]
  performance_metrics: Record<string, unknown>
  source: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Meta Ads Account Connection V1 (READ-ONLY) slice.
 *
 * This repository never handles the real access token directly -
 * that only ever passes through the connect_meta_ad_account() and
 * get_meta_ad_account_credential() SECURITY DEFINER RPCs, which
 * store it exclusively in Supabase Vault. MetaAdAccountLink
 * deliberately has no field for the token.
 */

const LINK_COLUMNS =
  "id, workspace_id, brand_id, meta_ad_account_id, meta_business_id, status, connected_by, connected_at, last_synced_at, last_sync_error, created_at, updated_at"

export async function getMetaAdAccountLinkForBrand(brandId: string): Promise<RepositoryResult<MetaAdAccountLink | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_account_links")
    .select(LINK_COLUMNS)
    .eq("brand_id", brandId)
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data as MetaAdAccountLink | null) ?? null, error: null }
}

export async function getMetaAdAccountLinkById(linkId: string): Promise<RepositoryResult<MetaAdAccountLink>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_account_links")
    .select(LINK_COLUMNS)
    .eq("id", linkId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as MetaAdAccountLink, error: null }
}

export async function connectMetaAdAccount(params: {
  workspaceId: string
  brandId: string
  metaAdAccountId: string
  metaBusinessId: string | null
  accessToken: string
}): Promise<RepositoryResult<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("connect_meta_ad_account", {
    p_workspace_id: params.workspaceId,
    p_brand_id: params.brandId,
    p_meta_ad_account_id: params.metaAdAccountId,
    p_meta_business_id: params.metaBusinessId,
    p_access_token: params.accessToken,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as string, error: null }
}

export async function getMetaAdAccountCredential(linkId: string): Promise<RepositoryResult<string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_meta_ad_account_credential", { p_link_id: linkId })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as string, error: null }
}

export async function disconnectMetaAdAccount(linkId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.rpc("disconnect_meta_ad_account", { p_link_id: linkId })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}

export async function recordSyncResult(params: {
  linkId: string
  success: boolean
  error?: string | null
  campaigns?: unknown[]
  adSets?: unknown[]
  ads?: unknown[]
  performanceMetrics?: Record<string, unknown>
}): Promise<RepositoryResult<MetaAdAccountSyncSnapshot | null>> {
  const supabase = await createClient()

  const { error: updateError } = await supabase
    .from("meta_ad_account_links")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: params.success ? null : (params.error ?? "Sync failed"),
      status: params.success ? "connected" : "error",
    })
    .eq("id", params.linkId)

  if (updateError) {
    return { data: null, error: updateError.message }
  }

  if (!params.success) {
    return { data: null, error: null }
  }

  const { data, error } = await supabase
    .from("meta_ad_account_sync_snapshots")
    .insert({
      meta_ad_account_link_id: params.linkId,
      campaigns: params.campaigns ?? [],
      ad_sets: params.adSets ?? [],
      ads: params.ads ?? [],
      performance_metrics: params.performanceMetrics ?? {},
    })
    .select("id, meta_ad_account_link_id, synced_at, campaigns, ad_sets, ads, performance_metrics, source")
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as MetaAdAccountSyncSnapshot, error: null }
}

export async function getLatestSyncSnapshot(linkId: string): Promise<RepositoryResult<MetaAdAccountSyncSnapshot | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_account_sync_snapshots")
    .select("id, meta_ad_account_link_id, synced_at, campaigns, ad_sets, ads, performance_metrics, source")
    .eq("meta_ad_account_link_id", linkId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data as MetaAdAccountSyncSnapshot | null) ?? null, error: null }
}
