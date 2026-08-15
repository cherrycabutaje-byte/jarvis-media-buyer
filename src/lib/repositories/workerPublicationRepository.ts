import { createWorkerClient } from "@/lib/supabase/worker"
import type { Publication, RepositoryResult } from "@/lib/repositories/publicationRepository"

/**
 * Worker-exclusive publication lifecycle repository (Publication
 * Worker Lifecycle slice). Mirrors workerJobRepository.ts exactly:
 * uses createWorkerClient() (the trusted, elevated, service_role
 * client), never the human-session client.
 *
 * claim_next_publication/complete_publication/fail_publication all
 * use RETURNS publications (a single composite type, not SETOF),
 * exactly like claim_next_job/complete_job/fail_job. PostgREST
 * serializes a SQL NULL composite as a fully-keyed JSON object with
 * every field null - {"id": null, ...} - not a bare JSON null. This
 * was discovered and fixed for claimNextJob in the Worker
 * Text-Generation Payload Validation slice; the same discriminator
 * (id === null) is applied proactively here for claimNextPublication,
 * since it has the identical composite-type shape.
 */

export async function claimNextPublication(): Promise<RepositoryResult<Publication | null>> {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc("claim_next_publication")

  if (error) {
    return { data: null, error: error.message }
  }

  if (data && (data as { id: string | null }).id === null) {
    return { data: null, error: null }
  }

  return { data: (data as Publication | null) ?? null, error: null }
}

export async function completePublication(
  publicationId: string,
  externalReferenceId: string | null,
  platformMetadata: Record<string, unknown> | null
): Promise<RepositoryResult<Publication>> {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc("complete_publication", {
    p_publication_id: publicationId,
    p_external_reference_id: externalReferenceId,
    p_platform_metadata: platformMetadata,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Publication, error: null }
}

export async function failPublication(
  publicationId: string,
  error: string,
  errorCategory: string | null
): Promise<RepositoryResult<Publication>> {
  const supabase = createWorkerClient()
  const { data, error: rpcError } = await supabase.rpc("fail_publication", {
    p_publication_id: publicationId,
    p_error: error,
    p_error_category: errorCategory,
  })

  if (rpcError) {
    return { data: null, error: rpcError.message }
  }
  return { data: data as Publication, error: null }
}