/**
 * JARVIS Brain - Module 9: Variation Engine
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is an Execution Planning Module. It does not create strategy,
 * positioning, messaging, or creative direction - it consumes the
 * approved Campaign Architecture and prepares a structured execution
 * package for exactly one variation, for the Builder Layer to later
 * turn into provider-specific instructions. It invents no new
 * strategy of its own.
 *
 * DESIGN NOTE: VariationStrategyPackage is shaped for a single
 * variation. Campaign Architecture produces multiple variations
 * (one per funnel stage). This module is designed to be called
 * once per variation - the caller iterates over
 * campaign.findings.variations and invokes this function for each
 * targetVariationId.
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
  VariationStrategyPackage,
  TextStrategyBrief,
  ImageCreativeBrief,
  MarketingFramework,
  ProductType,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineTestingGroup(index: number): string {
  const groups = ["Group A", "Group B", "Group C"];
  return groups[index] ?? "Group " + (index + 1);
}

function determineLengthGuidance(campaignType: ProductType): string {
  if (campaignType === "video-advertisement") {
    return "Concise - hook within the first 3 seconds, total narration equivalent under 30 seconds";
  }
  return "Concise - headline plus short supporting body, scannable in under 5 seconds";
}

function determineSubjectAction(framework: MarketingFramework): string {
  if (framework === "curiosity") {
    return "engaging in a surprising or intriguing moment";
  }
  if (framework === "social-proof") {
    return "being used or reviewed by a satisfied customer";
  }
  if (framework === "direct-benefit") {
    return "actively benefiting from the product's core value";
  }
  if (framework === "fear-relief") {
    return "moving from visible distress to visible relief";
  }
  if (framework === "identity-transformation") {
    return "embodying the transformed identity";
  }
  if (framework === "contrarian") {
    return "challenging a common assumption";
  }
  if (framework === "story") {
    return "moving through a narrative moment";
  }
  return "comparing directly against an alternative";
}

function determineBackground(
  pricePositioning: BusinessIntelligenceObject["pricePositioning"]
): string {
  if (pricePositioning === "premium" || pricePositioning === "value") {
    return "clean, minimal, softly blurred background";
  }
  if (pricePositioning === "budget") {
    return "bright, everyday, relatable background";
  }
  return "neutral, professional background";
}

function determineLighting(
  pricePositioning: BusinessIntelligenceObject["pricePositioning"]
): string {
  if (pricePositioning === "premium" || pricePositioning === "value") {
    return "soft, dramatic lighting";
  }
  if (pricePositioning === "budget") {
    return "bright, high-key lighting";
  }
  return "natural, balanced lighting";
}

function determineComposition(variationId: string): string {
  if (variationId.startsWith("v1")) {
    return "wide, scene-setting composition";
  }
  if (variationId.startsWith("v2")) {
    return "balanced composition featuring product and social proof elements";
  }
  if (variationId.startsWith("v3")) {
    return "tight, product-focused composition";
  }
  return "balanced composition";
}

function determineNegativeSpace(
  pricePositioning: BusinessIntelligenceObject["pricePositioning"]
): string {
  if (pricePositioning === "premium" || pricePositioning === "value") {
    return "generous negative space";
  }
  if (pricePositioning === "budget") {
    return "minimal negative space, dense layout";
  }
  return "moderate negative space";
}

function determineAspectRatio(campaignType: ProductType): string {
  if (campaignType === "video-advertisement") {
    return "9:16";
  }
  return "1:1";
}

function buildTextStrategyBrief(
  targetVariationId: string,
  variation: VariationDefinition,
  audience: AudienceIntelligenceObject,
  positioning: PositioningDecisionObject,
  messaging: MessagingStrategyObject,
  campaign: CampaignArchitectureObject
): TextStrategyBrief {
  return {
    assetType: campaign.campaignType,
    variationId: targetVariationId,
    audience: audience.primaryPersona + " (" + variation.audienceSegment + ")",
    primaryEmotion: variation.emotionalAngle,
    angle: positioning.winningAngle + " via framework: " + variation.framework,
    toneOfVoice: messaging.toneOfVoice,
    whatToSay: messaging.mustSay,
    whatNotToSay: messaging.mustNotSay,
    format: {
      platform: campaign.campaignType,
      components: ["headline", "body", "cta"],
      lengthGuidance: determineLengthGuidance(campaign.campaignType),
    },
    language: "en",
  };
}

function buildImageCreativeBrief(
  targetVariationId: string,
  variation: VariationDefinition,
  business: BusinessIntelligenceObject,
  campaign: CampaignArchitectureObject,
  mood: string[]
): ImageCreativeBrief {
  return {
    variationId: targetVariationId,
    emotion: variation.emotionalAngle,
    visualStyle: variation.visualConcept,
    subject: business.resolvedCategory + " product in use",
    subjectAction: determineSubjectAction(variation.framework),
    background: determineBackground(business.pricePositioning),
    lighting: determineLighting(business.pricePositioning),
    composition: determineComposition(targetVariationId),
    negativeSpace: determineNegativeSpace(business.pricePositioning),
    brandColors: ["UNKNOWN - brand colors not provided upstream"],
    platform: campaign.campaignType,
    aspectRatio: determineAspectRatio(campaign.campaignType),
    mood,
  };
}

// ============================================================
// PUBLIC API
// ============================================================

export function planVariationExecution(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>,
  messaging: IntelligenceModuleResult<MessagingStrategyObject>,
  creative: IntelligenceModuleResult<CreativeStrategyObject>,
  campaign: IntelligenceModuleResult<CampaignArchitectureObject>,
  targetVariationId: string
): IntelligenceModuleResult<VariationStrategyPackage> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;
  const messagingData = messaging.findings;
  const creativeData = creative.findings;
  const campaignData = campaign.findings;

  const variationIndex = campaignData.variations.findIndex(
    (v) => v.id === targetVariationId
  );
  const targetVariation =
    variationIndex >= 0 ? campaignData.variations[variationIndex] : undefined;

  if (!targetVariation) {
    const fallbackVariation: VariationDefinition = {
      id: targetVariationId,
      label: "UNKNOWN - variation not found in campaign architecture",
      framework: "curiosity",
      emotionalAngle: "UNKNOWN - variation not found",
      audienceSegment: "UNKNOWN - variation not found",
      visualConcept: "UNKNOWN - variation not found",
      confidenceScore: 0,
    };

    const fallbackFindings: VariationStrategyPackage = {
      variationId: targetVariationId,
      variationDefinition: fallbackVariation,
      textStrategyBrief: {
        assetType: "UNKNOWN",
        variationId: targetVariationId,
        audience: "UNKNOWN - variation not found",
        primaryEmotion: "UNKNOWN - variation not found",
        angle: "UNKNOWN - variation not found",
        toneOfVoice: ["UNKNOWN - variation not found"],
        whatToSay: ["UNKNOWN - variation not found"],
        whatNotToSay: ["UNKNOWN - variation not found"],
        format: { components: [], lengthGuidance: "UNKNOWN - variation not found" },
        language: "en",
      },
      imageCreativeBrief: {
        variationId: targetVariationId,
        emotion: "UNKNOWN - variation not found",
        visualStyle: "UNKNOWN - variation not found",
        subject: "UNKNOWN - variation not found",
        subjectAction: "UNKNOWN - variation not found",
        background: "UNKNOWN - variation not found",
        lighting: "UNKNOWN - variation not found",
        composition: "UNKNOWN - variation not found",
        negativeSpace: "UNKNOWN - variation not found",
        brandColors: ["UNKNOWN - variation not found"],
        platform: "UNKNOWN - variation not found",
        aspectRatio: "UNKNOWN - variation not found",
        mood: ["UNKNOWN - variation not found"],
      },
    };

    return {
      module: "VariationEngine",
      status: "unknown",
      confidence: 0.1,
      evidence: [],
      unknowns: [
        "Requested variation id not found in Campaign Architecture: " + targetVariationId,
      ],
      recommendationsForNext: [
        "Verify targetVariationId against campaign.findings.variations before calling this module",
      ],
      findings: fallbackFindings,
    };
  }

  const textStrategyBrief = buildTextStrategyBrief(
    targetVariationId,
    targetVariation,
    audienceData,
    positioningData,
    messagingData,
    campaignData
  );

  const imageCreativeBrief = buildImageCreativeBrief(
    targetVariationId,
    targetVariation,
    businessData,
    campaignData,
    messagingData.toneOfVoice
  );

  const findings: VariationStrategyPackage = {
    variationId: targetVariationId,
    variationDefinition: targetVariation,
    textStrategyBrief,
    imageCreativeBrief,
  };

  const unknowns: string[] = [];
  if (targetVariation.emotionalAngle.startsWith("UNKNOWN")) {
    unknowns.push("Emotional angle could not be determined for this variation");
  }
  if (targetVariation.visualConcept.startsWith("UNKNOWN")) {
    unknowns.push("Visual concept could not be determined for this variation");
  }
  if (messagingData.mustSay.length === 1 && messagingData.mustSay[0].startsWith("UNKNOWN")) {
    unknowns.push("Required messaging pillars unavailable for this variation");
  }
  if (positioningData.winningAngle.startsWith("UNKNOWN")) {
    unknowns.push("Winning angle unavailable for this variation");
  }

  const executionPriority = variationIndex + 1;
  const executionSequence =
    "Step " + executionPriority + " of " + campaignData.totalVariations;
  const testingGroup = determineTestingGroup(variationIndex);

  const evidence: string[] = [
    "Variation purpose: " + targetVariation.label + " (Campaign Architecture)",
    "Execution priority: " + executionPriority + " (position in Campaign Architecture's variation order)",
    "Execution sequence: " + executionSequence,
    "Testing group assignment: " + testingGroup,
    "Text strategy brief built from tone of voice, message pillars, and guardrails (Messaging Strategy)",
    "Image creative brief built from visual concept and price-driven visual style (Creative Strategy + Business Intelligence)",
  ];

  const hasCritical =
    targetVariation.emotionalAngle.startsWith("UNKNOWN") &&
    targetVariation.visualConcept.startsWith("UNKNOWN");
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const upstreamConfidenceAverage =
    (business.confidence +
      audience.confidence +
      competitor.confidence +
      offer.confidence +
      positioning.confidence +
      messaging.confidence +
      creative.confidence +
      campaign.confidence) /
    8;
  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "VariationEngine",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Testing group: " + testingGroup,
      "Execution sequence: " + executionSequence,
      "Proceed to Builder Layer with this execution package",
    ],
    findings,
  };
}