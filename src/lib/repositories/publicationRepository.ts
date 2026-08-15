import { createClient } from "@/lib/supabase/server"

/**
 * Represents exactly the columns of the existing, frozen
 * publications table (migration 009_publishing_layer,
 * "Architecture Version 1.0 - FROZEN"). No lifecycle fields beyond
 * what the table currently contains are added here - this is not a
 * design of the future publication lifecycle, only a faithful
 * mirror of the real row shape returned by
 * create_publication_request().
 */
export type PublicationStatus =
  | "scheduled"
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "canceled"

export interface Publication {
  id: string
  asset_id: string
  workspace_id: string
  platform_id: string
  job_id: string | null
  status: PublicationStatus
  scheduled_at: string
  published_at: string | null
  platform_metadata: Record<string, unknown>
  external_reference_id: string | null
  last_error: string | null
  error_category: string | null
  initiated_by: string
  created_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Calls the create_publication_request() SECURITY DEFINER function
 * (migration 20260814000001), which atomically validates and
 * inserts one publications row: caller authorization
 * (is_workspace_member admin), asset approval AND readiness gates,
 * platform existence/active status, and duplicate-active-request
 * protection (backed by the idx_publications_one_active partial
 * unique index, the true concurrency-safe enforcement). This
 * repository does not duplicate any of that logic; it only calls
 * the RPC and normalizes the result/error shape to match the
 * project's existing repository conventions.
 *
 * Uses the existing human-session client (@/lib/supabase/server) -
 * NOT the Worker/service-role client - since creating a publication
 * request is a human-initiated action (matching
 * create_publication_request's own authenticated-only grant),
 * distinct from the Worker's later, separate service_role-only
 * processing of that request (out of scope here).
 *
 * Passes only p_asset_id and p_platform_id, matching the function's
 * exact signature - workspace_id, initiated_by, status, and job_id
 * are all determined server-side inside the function itself and are
 * never accepted as caller-supplied parameters here.
 *
 * Does not add any publication lifecycle/update function - this is
 * the only command this repository exposes.
 */
export async function createPublicationRequest(
  assetId: string,
  platformId: string
): Promise<RepositoryResult<Publication>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_publication_request", {
    p_asset_id: assetId,
    p_platform_id: platformId,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Publication, error: null }
}