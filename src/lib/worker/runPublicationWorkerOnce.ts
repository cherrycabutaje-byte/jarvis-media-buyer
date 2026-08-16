import { claimNextPublication, completePublication, failPublication, getPublicationAssetText, getPublicationPlatformName } from "@/lib/repositories/workerPublicationRepository"
import { getPublicationCredential } from "@/lib/repositories/workerCredentialRepository"
import { resolvePublicationProvider } from "@/lib/providers/publicationProviderResolver"

export interface PublicationWorkerRunResult {
  claimed: boolean
  publicationId: string | null
  logLines: string[]
}

/**
 * Runs one Publication Worker cycle: claim -> resolve platform name
 * -> retrieve asset text -> retrieve credential -> resolve provider
 * (real Facebook or mock, per platform) -> execute -> complete or
 * fail.
 *
 * PROVIDER RESOLUTION (Real Meta Publishing Provider slice):
 * resolvePublicationProvider() chooses metaFacebookProvider for
 * "Facebook" and mockPublicationProvider for everything else
 * (including "Instagram", which remains deferred). The Worker
 * itself contains no raw Meta HTTP logic - that lives entirely
 * inside metaFacebookProvider.
 *
 * CREDENTIAL RETRIEVAL (Secure Publishing Credential Retrieval
 * slice, unchanged): the decrypted secret value itself is NEVER
 * logged, NEVER included in logLines, and NEVER returned in
 * PublicationWorkerRunResult - only the non-secret platformAccountId
 * is logged, purely to confirm retrieval succeeded.
 *
 * ASSET TEXT: if asset_payload.rawText is missing/empty, the
 * publication is failed cleanly with error_category 'content_error'
 * before any credential retrieval or provider call occurs.
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
    const platformNameResult = await getPublicationPlatformName(publication.platform_id)
    if (platformNameResult.error || !platformNameResult.data) {
      const errorMessage = platformNameResult.error ?? "Unable to resolve publishing platform."
      log(`[publication-worker] platform resolution failed for publication ${publication.id}: ${errorMessage}`, true)
      const failResult = await failPublication(publication.id, errorMessage, "platform_error")
      if (failResult.error) {
        log(`[publication-worker] failed to persist failure: ${failResult.error}`, true)
      } else {
        log(`[publication-worker] publication ${publication.id} failed - status: ${failResult.data?.status}`)
      }
      return { claimed: true, publicationId: publication.id, logLines }
    }
    const platformName = platformNameResult.data

    const textResult = await getPublicationAssetText(publication.asset_id)
    if (textResult.error || !textResult.data) {
      const errorMessage = textResult.error ?? "No publishable text available."
      log(`[publication-worker] asset text retrieval failed for publication ${publication.id}: ${errorMessage}`, true)
      const failResult = await failPublication(publication.id, errorMessage, "content_error")
      if (failResult.error) {
        log(`[publication-worker] failed to persist failure: ${failResult.error}`, true)
      } else {
        log(`[publication-worker] publication ${publication.id} failed - status: ${failResult.data?.status}`)
      }
      return { claimed: true, publicationId: publication.id, logLines }
    }

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

    const provider = resolvePublicationProvider(platformName)
    log(`[publication-worker] resolved provider: ${provider.providerName} for platform: ${platformName}`)

    const result = await provider.execute({
      id: publication.id,
      platformId: publication.platform_id,
      text: textResult.data,
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