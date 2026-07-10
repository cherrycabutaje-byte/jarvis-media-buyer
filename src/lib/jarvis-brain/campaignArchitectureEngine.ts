/**
 * JARVIS Brain - Module 8: Campaign Architecture Engine
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is a Decision Module. It designs campaign structure only -
 * campaign objective, funnel structure, customer journey, campaign
 * phases, asset requirements, platform allocation, variation
 * planning, and campaign priorities. It does NOT determine testing
 * strategy, success criteria, performance prediction, or measurement
 * strategy - those belong to Campaign Intelligence, which evaluates,
 * optimizes, and measures the architecture after it is designed.
 * It does not generate headlines, hooks, copy, images, videos,
 * prompts, or any user-facing asset.
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
 * CampaignArchitectureObject is not extended - funnel structure,
 * customer journey, phases, and priorities are expressed through
 * the ordered variations array itself.
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
  VariationDefinition,
  ProductType,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineCampaignName(
  business: BusinessIntelligenceObject,
  positioning: PositioningDecisionObject
): string {
  const categoryKnown = business.resolvedCategory !== "UNKNOWN";
  const angleKnown = !positioning.winningAngle.startsWith("UNKNOWN");

  if (!categoryKnown && !angleKnown) {
    return "UNKNOWN - insufficient data to name the campaign";
  }
  if (categoryKnown && angleKnown) {
    return business.resolvedCategory + " Campaign - " + positioning.winningAngle;
  }
  if (categoryKnown) {
    return business.resolvedCategory + " Campaign";
  }
  return "Campaign - " + positioning.winningAngle;
}

function determineCampaignType(creative: CreativeStrategyObject): ProductType {
  const assetType = creative.formatRecommendations.assetType ?? "";
  if (assetType.startsWith("video")) {
    return "video-advertisement";
  }
  return "static-advertisement";
}

function buildFunnelVariations(
  audience: AudienceIntelligenceObject,
  creative: CreativeStrategyObject,
  confidenceScore: number
): VariationDefinition[] {
  const tof: VariationDefinition = {
    id: "v1-tof",
    label: "Top of Funnel - Awareness",
    framework: "curiosity",
    emotionalAngle: audience.primaryEmotion,
    audienceSegment: "Cold audience - " + audience.awarenessLevel,
    visualConcept: creative.visualDirection,
    confidenceScore,
  };

  const mof: VariationDefinition = {
    id: "v2-mof",
    label: "Middle of Funnel - Social Proof and Differentiation",
    framework: "social-proof",
    emotionalAngle: audience.identityMotivation,
    audienceSegment: "Warm audience - evaluating options",
    visualConcept: creative.storyArc,
    confidenceScore,
  };

  const bof: VariationDefinition = {
    id: "v3-bof",
    label: "Bottom of Funnel - Direct Benefit and Urgency",
    framework: "direct-benefit",
    emotionalAngle: audience.deepestFear,
    audienceSegment: "Hot audience - ready to purchase",
    visualConcept: creative.creativeAngle,
    confidenceScore,
  };

  return [tof, mof, bof];
}

// ============================================================
// PUBLIC API
// ============================================================

export function decideCampaignArchitecture(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>,
  messaging: IntelligenceModuleResult<MessagingStrategyObject>,
  creative: IntelligenceModuleResult<CreativeStrategyObject>
): IntelligenceModuleResult<CampaignArchitectureObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;
  const messagingData = messaging.findings;
  const creativeData = creative.findings;

  const upstreamConfidenceAverage =
    (business.confidence +
      audience.confidence +
      competitor.confidence +
      offer.confidence +
      positioning.confidence +
      messaging.confidence +
      creative.confidence) /
    7;

  const campaignName = determineCampaignName(businessData, positioningData);
  const campaignType = determineCampaignType(creativeData);
  const variations = buildFunnelVariations(
    audienceData,
    creativeData,
    Math.max(0.2, Math.min(upstreamConfidenceAverage, 1.0))
  );
  const totalVariations = variations.length;

  const findings: CampaignArchitectureObject = {
    campaignName,
    campaignType,
    totalVariations,
    variations,
  };

  const unknowns: string[] = [];
  if (campaignName.startsWith("UNKNOWN")) {
    unknowns.push("Campaign name could not be determined");
  }
  for (const variation of variations) {
    if (variation.emotionalAngle.startsWith("UNKNOWN")) {
      unknowns.push(variation.label + ": emotional angle could not be determined");
    }
    if (variation.visualConcept.startsWith("UNKNOWN")) {
      unknowns.push(variation.label + ": visual concept could not be determined");
    }
  }

  const evidence: string[] = [
    "Campaign name derived from resolved category and winning angle (Business Intelligence + Positioning Engine)",
    "Campaign type (asset requirements and primary platform allocation) derived from asset type recommendation: " + creativeData.formatRecommendations.assetType + " (Creative Strategy)",
    "Campaign structured as a standard three-stage funnel (Top / Middle / Bottom), encoding customer journey, campaign phases, and campaign priorities through variation order",
    "Top of Funnel emotional angle and audience segment derived from primary emotion and awareness level (Audience Intelligence)",
    "Middle of Funnel emotional angle derived from identity motivation (Audience Intelligence); visual concept derived from story arc (Creative Strategy)",
    "Bottom of Funnel emotional angle derived from deepest fear (Audience Intelligence); visual concept derived from creative angle (Creative Strategy)",
  ];

  const hasCritical = campaignName.startsWith("UNKNOWN") && unknowns.length >= variations.length;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "CampaignArchitecture",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Campaign type: " + campaignType,
      "Total variations to build: " + totalVariations,
      "Funnel order: Top of Funnel -> Middle of Funnel -> Bottom of Funnel",
    ],
    findings,
  };
}