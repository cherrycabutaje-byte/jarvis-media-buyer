/**
 * Mock publication provider (Publication Worker Lifecycle slice).
 *
 * Mirrors the existing mockImageProvider precedent exactly: lets
 * the full claim -> execute -> complete/fail lifecycle be genuinely
 * exercised end-to-end without ever touching credentials or calling
 * a real external platform. Per explicit scope, this slice does not
 * retrieve/decrypt publishing credentials and does not call Meta,
 * Facebook, or Instagram - real platform integration is a separate,
 * future slice, exactly as image_generation's real provider
 * integration remains separately deferred today.
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