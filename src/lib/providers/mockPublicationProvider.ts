import type { PublicationCredential } from "@/lib/repositories/workerCredentialRepository"

/**
 * Mock publication provider (Publication Worker Lifecycle slice;
 * extended in Secure Publishing Credential Retrieval and Real Meta
 * Publishing Provider slices).
 *
 * Mirrors the existing mockImageProvider precedent exactly: lets
 * the full claim -> execute -> complete/fail lifecycle be genuinely
 * exercised end-to-end without ever touching credentials or calling
 * a real external platform. Used now for Instagram and any platform
 * other than Facebook - real platform integration for those remains
 * a separate, future slice (Instagram publishing is explicitly
 * blocked today by the missing media-storage architecture, per the
 * Real Meta Publishing Provider slice's own STOP report).
 *
 * PublicationProviderInput carries the retrieved, decrypted
 * PublicationCredential and the asset's final publishable text -
 * structurally identical to what metaFacebookProvider actually
 * consumes, so this mock remains a faithful drop-in for any
 * platform not yet real.
 */

export interface PublicationProviderResult {
  success: boolean
  externalReferenceId: string | null
  platformMetadata: Record<string, unknown>
  error: string | null
}

export interface PublicationProviderInput {
  id: string
  platformId: string
  text: string
  credential?: PublicationCredential
}

export const mockPublicationProvider = {
  providerName: "mock-publication-provider",
  async execute(publication: PublicationProviderInput): Promise<PublicationProviderResult> {
    return {
      success: true,
      externalReferenceId: `mock-ext-ref-${publication.id}`,
      platformMetadata: {
        mock: true,
        note: "No real platform call was made - Meta/Facebook/Instagram integration is out of scope for this slice.",
      },
      error: null,
    }
  },
}