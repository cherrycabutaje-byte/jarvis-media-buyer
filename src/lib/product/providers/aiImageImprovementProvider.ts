/**
 * AI Image Improvement Provider Abstraction V1
 *
 * ARCHITECTURAL NOTE:
 * This is a genuinely NEW, distinct capability from the resolution-
 * focused AI_IMPROVEMENT_REQUIRED signal already produced by
 * decideImageImprovement() in imageImprovement.ts. That existing
 * signal specifically means "resolution is too low; ordinary
 * resizing cannot fix this" - it does NOT mean "this photo has a
 * distracting background." Confirmed by direct inspection: no
 * deterministic evidence exists anywhere in this project for
 * judging background quality. Forcing BACKGROUND_REMOVAL into the
 * existing AI_IMPROVEMENT_REQUIRED slot would misrepresent what that
 * signal means. This capability is instead offered as a genuinely
 * separate, always-customer-optional "Advanced Improvement" -
 * available for any eligible physical-product photo, independent of
 * the deterministic engine's resolution finding.
 *
 * Vendor-agnostic interface: JARVIS business logic depends only on
 * this interface, never on a specific provider's SDK/request shape.
 */

export type AIImprovementOperation = "BACKGROUND_REMOVAL"

export interface AIImprovementRequest {
  sourceImageUrl: string
  operation: AIImprovementOperation
  preserveProductIdentity: true
}

export interface AIImprovementResult {
  success: boolean
  imageBytes: ArrayBuffer | null
  outputMimeType: string | null
  providerMetadata: {
    provider: string
    operation: AIImprovementOperation
    providerRequestId: string | null
    estimatedCostUsd: number | null
  } | null
  error: string | null
}

export interface AIImageImprovementProvider {
  improve(request: AIImprovementRequest): Promise<AIImprovementResult>
}
