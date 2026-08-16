import { mockPublicationProvider } from "@/lib/providers/mockPublicationProvider"
import type { PublicationProviderInput, PublicationProviderResult } from "@/lib/providers/mockPublicationProvider"
import { metaFacebookProvider } from "@/lib/providers/metaFacebookProvider"

export interface PublicationProvider {
  providerName: string
  execute(input: PublicationProviderInput): Promise<PublicationProviderResult>
}

/**
 * Resolves the correct publication provider for a given platform
 * name (Real Meta Publishing Provider slice).
 *
 * "Facebook" resolves to the real metaFacebookProvider. Every other
 * platform name (including "Instagram") resolves to
 * mockPublicationProvider - Instagram publishing remains explicitly
 * deferred (blocked by the missing media-storage architecture,
 * confirmed and reported before this slice began), so this resolver
 * deliberately does not attempt any real call for it.
 */
export function resolvePublicationProvider(platformName: string): PublicationProvider {
  if (platformName === "Facebook") {
    return metaFacebookProvider
  }
  return mockPublicationProvider
}