import { createWorkerClient } from "@/lib/supabase/worker"
import type { RepositoryResult } from "@/lib/repositories/publicationRepository"

/**
 * Worker-exclusive credential retrieval (Secure Publishing
 * Credential Retrieval slice). Uses createWorkerClient() (the
 * trusted, elevated, service_role client), never the human-session
 * client - matching workerPublicationRepository.ts's established
 * pattern exactly.
 *
 * Calls get_publication_credential() - the sole function in the
 * entire schema ever permitted to return a decrypted credential
 * value, service_role-only. Returns only the decrypted secret and
 * minimal metadata - never vault_secret_id, never
 * encrypted_credential.
 *
 * SAFETY CONTRACT: callers of this function must never log,
 * persist, or return decryptedSecret to any wider caller. It exists
 * only to be handed directly to a real platform provider adapter's
 * execute() call, in-memory, for the duration of a single publish
 * attempt.
 *
 * get_publication_credential() uses RETURNS TABLE (like
 * configure_publishing_credential), not a single composite type
 * like claim_next_publication - it raises a descriptive exception
 * before ever reaching its RETURN QUERY if no credential is
 * configured, so there is no ambiguous empty-row case to normalize
 * here (unlike the composite-type null-serialization gap fixed
 * elsewhere in this project).
 */

export interface PublicationCredential {
  decryptedSecret: string
  platformAccountId: string | null
  tokenExpiresAt: string | null
}

export async function getPublicationCredential(
  publicationId: string
): Promise<RepositoryResult<PublicationCredential>> {
  const supabase = createWorkerClient()
  const { data, error } = await supabase.rpc("get_publication_credential", {
    p_publication_id: publicationId,
  })

  if (error) {
    return { data: null, error: error.message }
  }

  const row = Array.isArray(data) ? data[0] : data

  if (!row) {
    return { data: null, error: "No publishing credential configured for this publication's workspace and platform." }
  }

  return {
    data: {
      decryptedSecret: row.decrypted_secret,
      platformAccountId: row.platform_account_id,
      tokenExpiresAt: row.token_expires_at,
    },
    error: null,
  }
}