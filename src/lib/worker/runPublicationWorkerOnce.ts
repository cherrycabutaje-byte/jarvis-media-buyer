import { claimNextPublication, completePublication, failPublication } from "@/lib/repositories/workerPublicationRepository"
import { getPublicationCredential } from "@/lib/repositories/workerCredentialRepository"
import { mockPublicationProvider } from "@/lib/providers/mockPublicationProvider"

export interface PublicationWorkerRunResult {
  claimed: boolean
  publicationId: string | null
  logLines: string[]
}

/**
 * Runs one Publication Worker cycle: claim -> retrieve credential ->
 * execute (mock provider only, per explicit scope) -> complete or
 * fail.
 *
 * CREDENTIAL RETRIEVAL (Secure Publishing Credential Retrieval
 * slice): after claiming, before calling the provider, the decrypted
 * credential is retrieved via getPublicationCredential(). The
 * decrypted secret value itself is NEVER logged, NEVER included in
 * logLines, and NEVER returned in PublicationWorkerRunResult - only
 * the non-secret platformAccountId (already exposed to authenticated
 * users elsewhere via list_publishing_credentials) is logged, purely
 * to confirm retrieval succeeded. If no credential is configured for
 * the publication's workspace+platform (the common case today, since
 * no real credentials exist yet in this project), the publication is
 * failed cleanly via failPublication() with error_category
 * 'credential_error', and the provider is never called at all.
 *
 * Mirrors runWorkerOnce.ts's structure exactly - same logging
 * convention, same try/catch-then-failPublication safety net on an
 * unexpected error during processing.
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
    const credentialResult = await getPublicationCredential(publication.id)

    if (credentialResult.error || !credentialResult.data) {
      const errorMessage = credentialResult.error ?? "No publishing credential available."
      log(`[publication-worker] credential retrieval failed for publication ${publication.id}: ${errorMessage}`, true)
      const failResult = await failPublication(publication.id, errorMessage, "credential_error")
      if (failResult.error) {
        log(`[publication-worker] failed to persist failure: ${failResult.error}`, true)
      } else {
        log(`[publication-worker] publication ${publication.id} failed - status: ${failResult.data?.status}`)
      }
      return { claimed: true, publicationId: publication.id, logLines }
    }

    // Never log credentialResult.data.decryptedSecret. Only the
    // non-secret platformAccountId is safe to log here.
    log(`[publication-worker] credential retrieved for publication ${publication.id} (platform account: ${credentialResult.data.platformAccountId ?? "none"})`)

    const result = await mockPublicationProvider.execute({
      id: publication.id,
      platformId: publication.platform_id,
      credential: credentialResult.data,
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