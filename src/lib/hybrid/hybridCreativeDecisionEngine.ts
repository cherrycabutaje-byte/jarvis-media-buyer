/**
 * Hybrid Creative Decision Engine V1
 *
 * ARCHITECTURAL NOTE:
 * This is a pure, deterministic decision layer - not a JARVIS Brain
 * intelligence module (it produces no IntelligenceModuleResult<T>
 * and does not participate in the Brain pipeline chain) and not a
 * Builder module (it produces no ImageCreativeBrief/ProviderPrompt).
 * It sits above both: it consumes the ALREADY-COMPUTED
 * CreativeStrategyObject (from the frozen Brain pipeline,
 * intelligence_pipeline.creativeStrategy) and the real Creative
 * Library inventory (creative_assets, Media Asset Foundation slice)
 * and decides HOW a creative should be produced - it does not
 * decide WHAT the creative strategy is, and it does not produce the
 * creative itself.
 *
 * ZERO AI CALLS: this module makes no network calls, no database
 * calls, no AI provider calls of any kind. It is pure input->output
 * logic, matching the same discipline already established
 * throughout src/lib/jarvis-brain - no side effects, no randomness,
 * no external services.
 *
 * PERMANENT HYBRID ECONOMIC HIERARCHY:
 *   1. REUSE               - raw source material already fits as-is
 *   2. REDESIGN            - a previous finished creative fits the
 *                             format but carries prior messaging
 *                             that must be updated
 *   3. REMIX                - multiple distinct existing components
 *                             can be assembled together
 *   4. PARTIAL_GENERATION   - some real evidence exists but a
 *                             genuinely missing component remains
 *   5. FULL_GENERATION      - the conservative fallback when no
 *                             usable evidence exists
 *
 * KEY DISTINCTION (raw material vs finished creative): a
 * `product_image`/`video`/`testimonial` asset is raw source
 * material with no prior campaign messaging baked into it, so a
 * direct format+product match can be REUSED as-is. A
 * `previous_creative` asset is, by definition, a FINISHED prior ad
 * that already has old messaging/CTA embedded in it - a format+
 * product match there is classified REDESIGN, not REUSE, since it
 * inherently needs updating to match the current strategy. This
 * distinction is evidence-based (asset category), not invented
 * visual understanding - the engine never claims to see what is
 * inside an image/video; it only reasons from real, persisted
 * metadata (category, source_type, mime_type, dimensions,
 * duration, product/brand/workspace association).
 *
 * QUALITY GATE: a `brand_asset` (logo) alone is never sufficient
 * evidence to satisfy a product-visual requirement (REUSE is never
 * chosen on logo evidence alone) - this is a hard rule, not a
 * confidence adjustment, directly satisfying the explicit test case
 * requiring this.
 */

export type HybridDecisionType =
  | "REUSE"
  | "REDESIGN"
  | "REMIX"
  | "PARTIAL_GENERATION"
  | "FULL_GENERATION"

export type RelativeCost = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"

export interface CreativeRequirement {
  /**
   * Derived from the real, already-computed
   * creativeStrategy.findings.formatRecommendations.assetType,
   * which is a full sentence (e.g. "video - offer strength score of
   * 8/10 supports a fuller narrative format"), not a clean enum.
   * "unknown" must be used honestly when the leading token cannot
   * be confidently parsed as "image" or "video" - never guessed.
   */
  requiredFormat: "image" | "video" | "unknown"
  /** The raw upstream sentence, kept for evidence/explainability. */
  formatRationale: string
  creativeAngle: string
  visualDirection: string
  /** Upstream creativeStrategy module's own status - propagated honestly, never discarded. */
  upstreamStatus: "complete" | "partial" | "unknown"
  /** Upstream creativeStrategy module's own confidence - propagated honestly. */
  upstreamConfidence: number
}

export interface CreativeAssetEvidence {
  id: string
  category: string
  sourceType: string
  mimeType: string
  widthPx: number | null
  heightPx: number | null
  durationSeconds: number | null
  productId: string | null
  brandId: string | null
  workspaceId: string
  originalFilename: string | null
  createdAt: string
}

export interface HybridDecisionContext {
  workspaceId: string
  productId: string
  brandId: string | null
}

export interface HybridDecisionResult {
  decision: HybridDecisionType
  reason: string
  selectedAssetIds: string[]
  missingComponents: string[]
  recommendedOperations: string[]
  confidence: number
  evidence: string[]
  relativeCost: RelativeCost
  estimatedGenerationRequirement: string
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/")
}

function matchesRequiredFormat(mimeType: string, requiredFormat: "image" | "video"): boolean {
  return requiredFormat === "image" ? isImageMime(mimeType) : isVideoMime(mimeType)
}

/**
 * Hard workspace isolation filter. An asset from any other
 * workspace is excluded before any decision logic runs at all -
 * this is a structural guarantee, not a confidence adjustment.
 */
function filterToWorkspace(
  assets: CreativeAssetEvidence[],
  workspaceId: string
): CreativeAssetEvidence[] {
  return assets.filter((a) => a.workspaceId === workspaceId)
}

/**
 * Assets genuinely scoped to this exact product. An asset tied to
 * a DIFFERENT product (even within the same, correct workspace) is
 * excluded here - this is the structural guarantee behind "wrong
 * product's asset must not be reused."
 */
function productScoped(
  assets: CreativeAssetEvidence[],
  productId: string
): CreativeAssetEvidence[] {
  return assets.filter((a) => a.productId === productId)
}

/**
 * Brand-level assets (logos/brand assets with no specific product
 * tie) that belong to the correct brand.
 */
function brandScoped(
  assets: CreativeAssetEvidence[],
  brandId: string | null
): CreativeAssetEvidence[] {
  if (!brandId) return []
  return assets.filter(
    (a) => a.productId === null && a.brandId === brandId && a.category === "brand_asset"
  )
}

function capConfidenceForUpstreamUncertainty(
  confidence: number,
  requirement: CreativeRequirement,
  evidence: string[]
): number {
  if (requirement.upstreamStatus !== "complete") {
    evidence.push(
      `Upstream creative strategy confidence was limited (status: ${requirement.upstreamStatus}, confidence: ${Math.round(requirement.upstreamConfidence * 100)}%) - decision confidence capped accordingly.`
    )
    return Math.min(confidence, 0.6)
  }
  return confidence
}

// ============================================================
// PUBLIC API
// ============================================================

export function decideCreativeProductionMethod(
  requirement: CreativeRequirement,
  availableAssets: CreativeAssetEvidence[],
  context: HybridDecisionContext
): HybridDecisionResult {
  const evidence: string[] = []

  // Hard structural isolation - never reachable to violate from here on.
  const workspaceAssets = filterToWorkspace(availableAssets, context.workspaceId)
  if (workspaceAssets.length < availableAssets.length) {
    evidence.push(
      `${availableAssets.length - workspaceAssets.length} asset(s) belonging to a different workspace were excluded before evaluation.`
    )
  }

  const productAssets = productScoped(workspaceAssets, context.productId)
  const brandAssets = brandScoped(workspaceAssets, context.brandId)

  if (productAssets.length < workspaceAssets.length - brandAssets.length) {
    evidence.push(
      "Asset(s) belonging to a different product in this workspace were excluded before evaluation."
    )
  }

  // Case I: insufficient evidence about the requirement itself.
  if (requirement.requiredFormat === "unknown") {
    evidence.push(
      `Creative format requirement could not be confidently determined from upstream strategy: "${requirement.formatRationale}"`
    )
    return {
      decision: "FULL_GENERATION",
      reason:
        "JARVIS could not confidently determine what type of creative (image or video) this strategy calls for, so it is conservatively recommending full generation rather than guessing.",
      selectedAssetIds: [],
      missingComponents: ["Creative format requirement"],
      recommendedOperations: ["Clarify creative strategy before proceeding"],
      confidence: 0.3,
      evidence,
      relativeCost: "VERY_HIGH",
      estimatedGenerationRequirement: `A full ${requirement.requiredFormat === "unknown" ? "creative" : requirement.requiredFormat} would need to be generated.`,
    }
  }

  const requiredFormat = requirement.requiredFormat

  // Raw source material that directly matches the requirement, for
  // this exact product - the strongest possible evidence.
  const rawMatch = productAssets.filter(
    (a) =>
      matchesRequiredFormat(a.mimeType, requiredFormat) &&
      (requiredFormat === "image" ? a.category === "product_image" : a.category === "video")
  )

  if (rawMatch.length > 0) {
    const chosen = rawMatch[0]
    evidence.push(
      `Found ${rawMatch.length} existing ${requiredFormat} asset(s) tagged for this exact product, with no prior campaign messaging embedded (source: ${chosen.sourceType}).`
    )
    const confidence = capConfidenceForUpstreamUncertainty(
      rawMatch.length === 1 ? 0.9 : 0.85,
      requirement,
      evidence
    )
    return {
      decision: "REUSE",
      reason:
        "You already have a usable, unmodified " +
        requiredFormat +
        " for this product that fits the current creative requirement.",
      selectedAssetIds: [chosen.id],
      missingComponents: [],
      recommendedOperations: ["Use this asset as-is in the new creative"],
      confidence,
      evidence,
      relativeCost: "VERY_LOW",
      estimatedGenerationRequirement: "None",
    }
  }

  // A previous finished creative in the right format - by
  // definition carries prior messaging, so it needs updating
  // rather than being reused verbatim.
  const finishedMatch = productAssets.filter(
    (a) => a.category === "previous_creative" && matchesRequiredFormat(a.mimeType, requiredFormat)
  )

  if (finishedMatch.length > 0) {
    const chosen = finishedMatch[0]
    evidence.push(
      `Found ${finishedMatch.length} previous creative(s) in the right format for this product - these carry prior campaign messaging that must be updated.`
    )
    const confidence = capConfidenceForUpstreamUncertainty(0.75, requirement, evidence)
    return {
      decision: "REDESIGN",
      reason:
        "You have a previous creative in the right format, but it was built for an earlier strategy. JARVIS recommends updating its messaging rather than starting over.",
      selectedAssetIds: [chosen.id],
      missingComponents: ["Updated messaging/CTA matching the current strategy"],
      recommendedOperations: [
        "Update headline/CTA to match the current creative strategy",
        "Reuse the existing visual as-is",
      ],
      confidence,
      evidence,
      relativeCost: "LOW",
      estimatedGenerationRequirement: "None - only messaging/text elements need updating.",
    }
  }

  // Component-level evidence: anything relevant we know about,
  // whether or not it directly matches the required format.
  const componentAssets = [...productAssets, ...brandAssets]
  const distinctCategories = new Set(componentAssets.map((a) => a.category))

  if (componentAssets.length >= 2 && distinctCategories.size >= 2) {
    evidence.push(
      `Found ${componentAssets.length} distinct existing component(s) across ${distinctCategories.size} categories (${Array.from(distinctCategories).join(", ")}) that can be combined.`
    )
    const confidence = capConfidenceForUpstreamUncertainty(0.65, requirement, evidence)
    return {
      decision: "REMIX",
      reason:
        "You already have several existing pieces - like a product photo and your brand logo - that can be assembled into a new creative without generating anything from scratch.",
      selectedAssetIds: componentAssets.map((a) => a.id),
      missingComponents: ["New hook/CTA treatment to tie the pieces together"],
      recommendedOperations: [
        "Assemble existing components into a new creative",
        "Add new hook/CTA text",
      ],
      confidence,
      evidence,
      relativeCost: distinctCategories.size >= 3 ? "MEDIUM" : "LOW",
      estimatedGenerationRequirement: "None - only assembly and new text/layout treatment.",
    }
  }

  // Exactly one relevant component. A logo alone is explicitly
  // disqualified from counting as sufficient partial evidence for a
  // product-visual requirement - the quality gate this test case
  // specifically requires.
  if (componentAssets.length === 1) {
    const onlyAsset = componentAssets[0]
    const isLogoOnly = onlyAsset.category === "brand_asset"

    if (isLogoOnly) {
      evidence.push(
        "Only a brand logo exists for this product - a logo alone is not sufficient evidence to build the required product visual, so it is not counted as reusable coverage."
      )
      const confidence = capConfidenceForUpstreamUncertainty(0.8, requirement, evidence)
      return {
        decision: "FULL_GENERATION",
        reason: `Only your brand logo is available, and the strategy requires a real product ${requiredFormat}. JARVIS recommends generating this from scratch, while incorporating your logo for brand consistency.`,
        selectedAssetIds: [],
        missingComponents: [`Product ${requiredFormat}`],
        recommendedOperations: [
          `Generate a new product ${requiredFormat} from scratch`,
          "Incorporate the existing brand logo for consistency",
        ],
        confidence,
        evidence,
        relativeCost: "VERY_HIGH",
        estimatedGenerationRequirement: `A full product ${requiredFormat} would need to be generated.`,
      }
    }

    evidence.push(
      `Found one relevant existing asset (${onlyAsset.category}) that does not directly satisfy the required ${requiredFormat}, but can inform or be incorporated into new production.`
    )
    const confidence = capConfidenceForUpstreamUncertainty(0.6, requirement, evidence)
    return {
      decision: "PARTIAL_GENERATION",
      reason: `You have a related asset (${onlyAsset.category.replace("_", " ")}) that JARVIS can preserve and build around, but the required ${requiredFormat} still needs to be generated.`,
      selectedAssetIds: [onlyAsset.id],
      missingComponents: [`Product ${requiredFormat}`],
      recommendedOperations: [
        `Preserve the existing ${onlyAsset.category.replace("_", " ")}`,
        `Generate the missing ${requiredFormat} component`,
      ],
      confidence,
      evidence,
      relativeCost: "HIGH",
      estimatedGenerationRequirement: `A ${requiredFormat} component would need to be generated; existing material can inform it.`,
    }
  }

  // Nothing usable at all - the conservative fallback.
  evidence.push(`No relevant existing assets were found for this product's creative requirement.`)
  const confidence = capConfidenceForUpstreamUncertainty(0.85, requirement, evidence)
  return {
    decision: "FULL_GENERATION",
    reason: `JARVIS doesn't have any existing material for this product yet, so a new ${requiredFormat} needs to be generated from scratch.`,
    selectedAssetIds: [],
    missingComponents: [`Product ${requiredFormat}`],
    recommendedOperations: [`Generate a new product ${requiredFormat} from scratch`],
    confidence,
    evidence,
    relativeCost: "VERY_HIGH",
    estimatedGenerationRequirement: `A full product ${requiredFormat} would need to be generated.`,
  }
}

/**
 * Parses the real, existing creativeStrategy.findings.
 * formatRecommendations.assetType sentence into a clean requirement
 * signal. This string always begins with either "video" or "image"
 * followed by " - " (confirmed by direct inspection of
 * src/lib/jarvis-brain/creativeStrategy.ts's determineFormatRecommendations,
 * which only ever produces those two leading tokens) - "unknown" is
 * used honestly for any other case, never guessed.
 */
export function parseCreativeRequirement(creativeStrategyResult: {
  status: "complete" | "partial" | "unknown"
  confidence: number
  findings: {
    creativeAngle: string
    visualDirection: string
    formatRecommendations: { assetType?: string }
  }
}): CreativeRequirement {
  const assetTypeSentence = creativeStrategyResult.findings.formatRecommendations.assetType ?? ""
  let requiredFormat: "image" | "video" | "unknown" = "unknown"
  if (assetTypeSentence.startsWith("video")) {
    requiredFormat = "video"
  } else if (assetTypeSentence.startsWith("image")) {
    requiredFormat = "image"
  }

  return {
    requiredFormat,
    formatRationale: assetTypeSentence,
    creativeAngle: creativeStrategyResult.findings.creativeAngle,
    visualDirection: creativeStrategyResult.findings.visualDirection,
    upstreamStatus: creativeStrategyResult.status,
    upstreamConfidence: creativeStrategyResult.confidence,
  }
}
