"use server"

import { createPublicationRequest } from "@/lib/repositories/publicationRepository"
import type { Publication } from "@/lib/repositories/publicationRepository"

export interface CreatePublicationRequestResult {
  success: boolean
  data: Publication | null
  error: string | null
}

/**
 * Server Action: creates one publication request for an approved,
 * ready asset against an active publishing platform.
 *
 * All business rules - caller authorization (workspace admin),
 * asset approval AND readiness gates, platform existence/active
 * status, workspace derivation from the asset (never caller-
 * supplied), initiated_by from auth.uid() (never caller-supplied),
 * and duplicate-active-request protection (backed by the
 * idx_publications_one_active partial unique index) - are enforced
 * entirely inside the frozen create_publication_request() database
 * function. This action performs no additional validation beyond a
 * basic presence check on the two accepted parameters, and
 * constructs no Supabase client of its own - it only calls
 * createPublicationRequest() from publicationRepository.ts, which
 * uses the existing human-session client. The "must be logged in"
 * case is handled entirely by the RPC's own auth.uid() check,
 * surfaced through the repository's existing error-normalization
 * convention.
 *
 * Accepts only assetId and platformId - workspace_id, initiated_by,
 * status, job_id, publishing credentials, credential secrets, and
 * platform metadata are never accepted here; all of those are
 * either determined server-side inside the database function or are
 * out of scope for this slice entirely.
 *
 * No redirect or revalidation - no comparable existing Server
 * Action in this project uses either.
 */
export async function createPublicationRequestAction(
  assetId: string,
  platformId: string
): Promise<CreatePublicationRequestResult> {
  if (!assetId) {
    return { success: false, data: null, error: "Asset ID is required." }
  }
  if (!platformId) {
    return { success: false, data: null, error: "Platform ID is required." }
  }

  const result = await createPublicationRequest(assetId, platformId)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}