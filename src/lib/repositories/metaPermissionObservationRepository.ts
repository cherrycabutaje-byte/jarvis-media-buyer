import { createClient } from "@/lib/supabase/server"
import type { MetaPermissionStatus } from "@/lib/product/metaPermission"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Meta OAuth Permission Capability V1 slice.
 *
 * Dedicated table (meta_permission_observations), deliberately
 * separate from meta_page_identities - see migration
 * 20260902000001_meta_permission_observations.sql for the full
 * architectural rationale. Never stores a token, App Secret, or
 * authorization code.
 */
export interface StoredMetaPermissionObservation {
  id: string
  workspace_id: string
  brand_id: string
  meta_ad_account_link_id: string
  permission: string
  status: string
  observed_at: string
}

const OBSERVATION_COLUMNS = "id, workspace_id, brand_id, meta_ad_account_link_id, permission, status, observed_at"

/**
 * Replaces the trusted permission snapshot for one link with a fresh
 * observation - delete-then-insert, matching the exact same pattern
 * already proven for replaceTrustedPageIdentities().
 */
export async function replacePermissionObservations(params: {
  workspaceId: string
  brandId: string
  metaAdAccountLinkId: string
  permissions: Array<{ permission: string; status: MetaPermissionStatus }>
  observedAt: string
}): Promise<RepositoryResult<StoredMetaPermissionObservation[]>> {
  const supabase = await createClient()

  const { error: deleteError } = await supabase.from("meta_permission_observations").delete().eq("meta_ad_account_link_id", params.metaAdAccountLinkId)
  if (deleteError) {
    return { data: null, error: deleteError.message }
  }

  if (params.permissions.length === 0) {
    return { data: [], error: null }
  }

  const rows = params.permissions.map((p) => ({
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    meta_ad_account_link_id: params.metaAdAccountLinkId,
    permission: p.permission,
    status: p.status,
    observed_at: params.observedAt,
  }))

  const { data, error } = await supabase.from("meta_permission_observations").insert(rows).select(OBSERVATION_COLUMNS)
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredMetaPermissionObservation[], error: null }
}

export async function getPermissionObservationsForLink(metaAdAccountLinkId: string): Promise<RepositoryResult<StoredMetaPermissionObservation[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_permission_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("meta_ad_account_link_id", metaAdAccountLinkId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredMetaPermissionObservation[], error: null }
}