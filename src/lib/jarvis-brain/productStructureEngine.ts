/**
 * JARVIS Brain - Module 11: Product Structure Engine
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - FIRST BUILDER LAYER MODULE
 *
 * ARCHITECTURAL NOTE:
 * This is the first Builder Layer module. It does not generate any
 * content. It determines WHAT must be produced for the selected
 * Marketing Product - a production plan, not the production itself.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 * - Module identity is expressed only through the outer wrapper's
 *   `module` field - findings objects do not duplicate it with `_module`.
 *
 * DEPENDENCY: types.ts only. Consumes upstream module outputs
 * through their public IntelligenceModuleResult<T> contract only.
 * Entry point into the Builder Layer - depends on all ten completed
 * Brain modules, never on any future Builder module.
 */

import type {
  BusinessIntelligenceObject,
  AudienceIntelligenceObject,
  CompetitorIntelligenceObject,
  OfferIntelligenceObject,
  PositioningDecisionObject,
  MessagingStrategyObject,
  CreativeStrategyObject,
  CampaignArchitectureObject,
  VariationStrategyPackage,
  CampaignIntelligenceObject,
  ProductStructureObject,
  ProductType,
  ProviderType,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// PRODUCTION TEMPLATES
// Deterministic production-planning knowledge per product type.
// Not derived from upstream findings - this is structural
// knowledge about what each product type requires, analogous to
// the category knowledge tables used in earlier Intelligence
// modules.
// ============================================================

interface ProductStructureTemplate {
  textComponents: string[];
  imageComponents: string[];
  videoComponents: string[];
  outputFormats: string[];
}

const PRODUCT_STRUCTURE_TEMPLATES: Record<ProductType, ProductStructureTemplate> = {
  "static-advertisement": {
    textComponents: ["headline", "primary copy", "cta"],
    imageComponents: ["one image"],
    videoComponents: [],
    outputFormats: ["jpg", "png"],
  },
  "video-advertisement": {
    textComponents: ["headline or hook script", "primary copy or voiceover script", "cta"],
    imageComponents: ["thumbnail image"],
    videoComponents: ["one video"],
    outputFormats: ["mp4"],
  },
  "carousel-advertisement": {
    textComponents: ["headline", "per-card copy", "cta"],
    imageComponents: ["multiple images (one per card)"],
    videoComponents: [],
    outputFormats: ["jpg", "png"],
  },
  "story-advertisement": {
    textComponents: ["short copy", "cta"],
    imageComponents: ["one vertical image"],
    videoComponents: [],
    outputFormats: ["jpg", "png"],
  },
  "landing-page": {
    textComponents: ["hero section copy", "benefits copy", "social proof copy", "faq copy", "cta"],
    imageComponents: ["supporting images"],
    videoComponents: [],
    outputFormats: ["html"],
  },
  "email-campaign": {
    textComponents: ["subject line", "preview text", "body", "cta"],
    imageComponents: [],
    videoComponents: [],
    outputFormats: ["html", "plain-text"],
  },
  "google-ads": {
    textComponents: ["headlines (multiple)", "descriptions (multiple)", "cta"],
    imageComponents: [],
    videoComponents: [],
    outputFormats: ["plain-text"],
  },
  "instagram-campaign": {
    textComponents: ["caption", "cta"],
    imageComponents: ["feed images"],
    videoComponents: [],
    outputFormats: ["jpg", "png"],
  },
  "ugc-package": {
    textComponents: ["script", "caption"],
    imageComponents: [],
    videoComponents: ["ugc-style video"],
    outputFormats: ["mp4"],
  },
  "facebook-campaign": {
    textComponents: ["headline", "primary copy", "cta"],
    imageComponents: ["ad images"],
    videoComponents: [],
    outputFormats: ["jpg", "png"],
  },
  "product-launch-kit": {
    textComponents: ["landing page copy", "static ad copy", "email copy"],
    imageComponents: ["ad images", "supporting images"],
    videoComponents: ["launch video"],
    outputFormats: ["html", "jpg", "png", "mp4"],
  },
  "brand-kit": {
    textComponents: ["brand voice guide"],
    imageComponents: ["logo variations", "color palette reference"],
    videoComponents: [],
    outputFormats: ["pdf", "png"],
  },
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineProvidersRequired(
  template: ProductStructureTemplate
): ProviderType[] {
  const providers: ProviderType[] = [];
  if (template.textComponents.length > 0) providers.push("text");
  if (template.imageComponents.length > 0) providers.push("image");
  if (template.videoComponents.length > 0) providers.push("video");
  return providers;
}

function determineSharedComponents(
  productType: ProductType,
  messaging: MessagingStrategyObject
): string[] {
  const shared: string[] = [
    "tone of voice: " + messaging.toneOfVoice.join(", "),
    "messaging guardrails (must-not-say list)",
  ];
  if (productType === "product-launch-kit") {
    shared.push("creative briefs");
  }
  return shared;
}

// ============================================================
// PUBLIC API
// ============================================================

export function buildProductStructure(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>,
  messaging: IntelligenceModuleResult<MessagingStrategyObject>,
  creative: IntelligenceModuleResult<CreativeStrategyObject>,
  campaign: IntelligenceModuleResult<CampaignArchitectureObject>,
  variations: IntelligenceModuleResult<VariationStrategyPackage>[],
  campaignIntelligence: IntelligenceModuleResult<CampaignIntelligenceObject>
): IntelligenceModuleResult<ProductStructureObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;
  const messagingData = messaging.findings;
  const creativeData = creative.findings;
  const campaignData = campaign.findings;
  const campaignIntelligenceData = campaignIntelligence.findings;

  const productType = campaignData.campaignType;
  const template = PRODUCT_STRUCTURE_TEMPLATES[productType];

  const providersRequired = determineProvidersRequired(template);
  const sharedComponents = determineSharedComponents(productType, messagingData);

  const findings: ProductStructureObject = {
    productType,
    variationCount: campaignData.totalVariations,
    textComponents: template.textComponents,
    imageComponents: template.imageComponents,
    videoComponents: template.videoComponents,
    sharedComponents,
    outputFormats: template.outputFormats,
    providersRequired,
  };

  const unknowns: string[] = [];

  if (variations.length !== campaignData.totalVariations) {
    unknowns.push(
      "Variation coverage incomplete: " + variations.length + " execution package(s) prepared, but Campaign Architecture defines " + campaignData.totalVariations + " variation(s)"
    );
  }

  for (const variationResult of variations) {
    const variationFindings = variationResult.findings;
    if (variationFindings.textStrategyBrief.assetType !== productType) {
      unknowns.push(
        "Variation " + variationFindings.variationId + ": asset type mismatch - execution package built for " +
        variationFindings.textStrategyBrief.assetType + ", but campaign product type is " + productType
      );
    }
  }

  const totalAssetSlots =
    campaignData.totalVariations *
    (template.textComponents.length + template.imageComponents.length + template.videoComponents.length);

  const evidence: string[] = [
    "Product type resolved from Campaign Architecture: " + productType,
    "Component template applied for this product type (production planning knowledge, not upstream-derived facts)",
    "Shared components derived from Messaging Strategy tone of voice and guardrails",
    "Variation count derived from Campaign Architecture: " + campaignData.totalVariations,
    "Cross-checked " + variations.length + " prepared Variation Engine execution package(s) against the campaign's variation count",
  ];

  const status: ModuleStatus = unknowns.length > 0 ? "partial" : "complete";

  const upstreamConfidenceAverage =
    (business.confidence +
      audience.confidence +
      competitor.confidence +
      offer.confidence +
      positioning.confidence +
      messaging.confidence +
      creative.confidence +
      campaign.confidence +
      campaignIntelligence.confidence) /
    9;
  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "ProductStructure",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Builder sequence: prepare text assets first, then image or video assets, then final assembly",
      "Production dependency: image and video briefs should stay aligned with finalized text assets for messaging consistency",
      "Completeness requirement: production is complete only when all " + totalAssetSlots +
        " total asset slots (" + campaignData.totalVariations + " variations x component categories) have a corresponding generated asset",
      "Produce the recommended variation first: " + campaignIntelligenceData.recommendedVariation + " (per Campaign Intelligence)",
    ],
    findings,
  };
}