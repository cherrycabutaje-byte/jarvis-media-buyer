import { createClient } from "@/lib/supabase/server"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Meta Page & Instagram Identity Read / Verification V1 slice.
 *
 * Dedicated table (meta_page_identities), deliberately separate from
 * creative_execution_contexts - see migration
 * 20260901000001_meta_page_identities.sql for the full architectural
 * rationale. Never stores an access token - meta_ad_account_link_id
 * only references the link whose already-vaulted credential was used
 * to observe each identity.
 */
export interface StoredMetaPageIdentity {
  id: string
  workspace_id: string
  brand_id: string
  meta_ad_account_link_id: string
  page_id: string
  page_name: string | null
  instagram_actor_id: string | null
  instagram_username: string | null
  observed_at: string
  created_at: string
}

const IDENTITY_COLUMNS =
  "id, workspace_id, brand_id, meta_ad_account_link_id, page_id, page_name, instagram_actor_id, instagram_username, observed_at, created_at"

/**
 * Replaces the trusted identity snapshot for one link with a fresh
 * sync result - delete-then-insert within the caller's own
 * transaction-less sequence, matching the existing (non-transactional)
 * pattern already used by recordSyncResult() for Meta ad account
 * sync snapshots. A failed insert never leaves stale AND fresh rows
 * coexisting ambiguously beyond the delete step; a failed sync
 * overall is reported as an error rather than silently keeping
 * possibly-revoked old identities as if still trusted.
 */
export async function replaceTrustedPageIdentities(params: {
  workspaceId: string
  brandId: string
  metaAdAccountLinkId: string
  identities: Array<{ pageId: string; pageName: string | null; instagramActorId: string | null; instagramUsername: string | null; observedAt: string }>
}): Promise<RepositoryResult<StoredMetaPageIdentity[]>> {
  const supabase = await createClient()

  const { error: deleteError } = await supabase.from("meta_page_identities").delete().eq("meta_ad_account_link_id", params.metaAdAccountLinkId)
  if (deleteError) {
    return { data: null, error: deleteError.message }
  }

  if (params.identities.length === 0) {
    return { data: [], error: null }
  }

  const rows = params.identities.map((identity) => ({
    workspace_id: params.workspaceId,
    brand_id: params.brandId,
    meta_ad_account_link_id: params.metaAdAccountLinkId,
    page_id: identity.pageId,
    page_name: identity.pageName,
    instagram_actor_id: identity.instagramActorId,
    instagram_username: identity.instagramUsername,
    observed_at: identity.observedAt,
  }))

  const { data, error } = await supabase.from("meta_page_identities").insert(rows).select(IDENTITY_COLUMNS)
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredMetaPageIdentity[], error: null }
}

export async function getTrustedPageIdentitiesForLink(metaAdAccountLinkId: string): Promise<RepositoryResult<StoredMetaPageIdentity[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_page_identities")
    .select(IDENTITY_COLUMNS)
    .eq("meta_ad_account_link_id", metaAdAccountLinkId)
    .order("page_name", { ascending: true })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredMetaPageIdentity[], error: null }
}

/**
 * The single trusted lookup used by Creative Execution Context
 * readiness/authorization - proves a specific Page ID is trusted
 * for the EXACT link (and therefore brand) supplied, never a bare
 * global existence check.
 */
export async function getTrustedPageIdentity(metaAdAccountLinkId: string, pageId: string): Promise<RepositoryResult<StoredMetaPageIdentity | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_page_identities")
    .select(IDENTITY_COLUMNS)
    .eq("meta_ad_account_link_id", metaAdAccountLinkId)
    .eq("page_id", pageId)
    .maybeSingle()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data as StoredMetaPageIdentity | null) ?? null, error: null }
}