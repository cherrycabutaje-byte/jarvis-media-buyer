import { claimNextPublication, completePublication, failPublication } from "@/lib/repositories/workerPublicationRepository"
import { mockPublicationProvider } from "@/lib/providers/mockPublicationProvider"

export interface PublicationWorkerRunResult {
  claimed: boolean
  publicationId: string | null
  logLines: string[]
}

/**
 * Runs one Publication Worker cycle: claim -> execute (mock
 * provider only, per explicit scope) -> complete or fail.
 *
 * Mirrors runWorkerOnce.ts's structure exactly - same logging
 * convention, same try/catch-then-failPublication safety net on an
 * unexpected error during processing (matching runWorkerOnce's own
 * discipline, though here the failure path itself is also captured
 * rather than left generically caught, since fail_publication is a
 * safe, idempotent-on-failure operation given the eligibility check
 * inside the frozen function).
 */
export async function runPublicationWorkerOnce(): Promise<PublicationWorkerRunResult> {
  const logLines: string[] = []

  function log(line: string, isError = false) {
    logLines.push(line)
    if (isError) {
      console.error(line)
    } else {
      console.log(line)
    }
  }

  const claimResult = await claimNextPublication()
  if (claimResult.error) {
    log(`[publication-worker] claim_next_publication failed: ${claimResult.error}`, true)
    return { claimed: false, publicationId: null, logLines }
  }

  const publication = claimResult.data
  if (!publication) {
    log(`[publication-worker] no eligible publication found - queue is empty`)
    return { claimed: false, publicationId: null, logLines }
  }

  log(`[publication-worker] claimed publication ${publication.id} (asset: ${publication.asset_id}, platform: ${publication.platform_id})`)

  try {
    const result = await mockPublicationProvider.execute({
      id: publication.id,
      platformId: publication.platform_id,
    })

    if (result.success) {
      const completeResult = await completePublication(
        publication.id,
        result.externalReferenceId,
        result.platformMetadata
      )
      if (completeResult.error) {
        log(`[publication-worker] failed to persist completion: ${completeResult.error}`, true)
      } else {
        log(`[publication-worker] publication ${publication.id} completed - status: ${completeResult.data?.status}`)
      }
    } else {
      const failResult = await failPublication(
        publication.id,
        result.error ?? "Unknown provider failure",
        "provider_error"
      )
      if (failResult.error) {
        log(`[publication-worker] failed to persist failure: ${failResult.error}`, true)
      } else {
        log(`[publication-worker] publication ${publication.id} failed - status: ${failResult.data?.status}`)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[publication-worker] unexpected error during processing: ${message}`, true)
    const failResult = await failPublication(publication.id, message, "worker_error")
    if (failResult.error) {
      log(`[publication-worker] failed to persist failure after unexpected error: ${failResult.error}`, true)
    }
  }

  return { claimed: true, publicationId: publication.id, logLines }
}