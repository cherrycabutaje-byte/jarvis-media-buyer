import type { PublicationProviderInput, PublicationProviderResult } from "@/lib/providers/mockPublicationProvider"

/**
 * Real Meta Facebook Page text-post provider (Real Meta Publishing
 * Provider slice).
 *
 * Verified against official Meta documentation
 * (developers.facebook.com/docs/pages-api/getting-started/):
 * POST /{page-id}/feed with `message` and `access_token`, requiring
 * the pages_manage_posts permission and a Page Access Token.
 * Current API version per Meta's own docs: v25.0.
 *
 * SMALLEST REAL SLICE: Facebook TEXT-ONLY posting only. Facebook
 * photo/video posting and all Instagram publishing remain
 * explicitly deferred - both are blocked by the same underlying gap
 * (no real image/video asset or public-media-URL mechanism exists
 * anywhere in this project yet), confirmed via direct repository
 * inspection and reported as a genuine stop condition before this
 * slice began.
 *
 * CREDENTIAL SAFETY: the access_token is read once from the
 * in-memory PublicationCredential, placed into a POST body (never a
 * logged URL/query string), and never appears in any log line,
 * thrown error, or returned PublicationProviderResult. Meta's own
 * error response objects (json.error.message/type/code) never echo
 * back the caller's token, so those fields alone are safe to
 * surface in a failure result.
 *
 * TESTABILITY: execute() accepts an optional injectable fetchImpl
 * (defaulting to the global fetch), so this provider's request
 * construction, response parsing, and error-sanitization logic can
 * be fully exercised locally with a mocked HTTP boundary - no real
 * network call to graph.facebook.com occurs unless the real global
 * fetch is actually used, which this slice's own testing avoids
 * per explicit instruction.
 */

const GRAPH_API_VERSION = "v25.0"

export type FetchLike = typeof fetch

interface MetaErrorResponse {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

interface MetaFeedSuccessResponse {
  id?: string
}

export const metaFacebookProvider = {
  providerName: "meta-facebook-provider",
  async execute(
    publication: PublicationProviderInput,
    fetchImpl: FetchLike = fetch
  ): Promise<PublicationProviderResult> {
    const credential = publication.credential

    if (!credential) {
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {},
        error: "No credential was provided to the Facebook provider.",
      }
    }

    const pageId = credential.platformAccountId
    if (!pageId) {
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {},
        error: "No Facebook Page ID (platform_account_id) is configured for this credential.",
      }
    }

    const body = new URLSearchParams()
    body.set("message", publication.text)
    // The access_token is placed only into this POST body, never a
    // URL/query string, and this body value is never logged.
    body.set("access_token", credential.decryptedSecret)

    let response: Response
    try {
      response = await fetchImpl(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      })
    } catch {
      // Deliberately do not include the caught error's own message
      // here - some HTTP client implementations embed the request
      // URL/body in network-failure error objects. Only a safe,
      // static description is ever returned.
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {},
        error: "Network error while contacting the Facebook Graph API.",
      }
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {},
        error: `Facebook returned a non-JSON response (HTTP ${response.status}).`,
      }
    }

    if (!response.ok) {
      const metaError = (json as MetaErrorResponse)?.error
      const safeMessage = metaError?.message ?? `Facebook Graph API request failed (HTTP ${response.status}).`
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {
          metaErrorType: metaError?.type ?? null,
          metaErrorCode: metaError?.code ?? null,
        },
        error: safeMessage,
      }
    }

    const postId = (json as MetaFeedSuccessResponse)?.id
    if (!postId) {
      return {
        success: false,
        externalReferenceId: null,
        platformMetadata: {},
        error: "Facebook Graph API returned success but no post id.",
      }
    }

    return {
      success: true,
      externalReferenceId: postId,
      platformMetadata: { platform: "facebook", apiVersion: GRAPH_API_VERSION },
      error: null,
    }
  },
}