/**
 * JARVIS Brain - Module 7: Creative Strategy
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is a Decision Module. It determines HOW the marketing message
 * should be visually communicated. It does not generate prompts,
 * images, videos, copy, headlines, hooks, or CTAs - those belong to
 * later Builder modules. It produces creative decisions only.
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
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineCreativeAngle(
  positioning: PositioningDecisionObject,
  messaging: MessagingStrategyObject
): string {
  const angleKnown = !positioning.winningAngle.startsWith("UNKNOWN");
  const messageKnown = !messaging.coreMessage.startsWith("UNKNOWN");

  if (!angleKnown && !messageKnown) {
    return "UNKNOWN - insufficient data to determine creative angle";
  }
  if (angleKnown && messageKnown) {
    return "Visualize the angle: " + positioning.winningAngle + ", framed around: " + messaging.coreMessage;
  }
  if (angleKnown) {
    return "Visualize the angle: " + positioning.winningAngle;
  }
  return "Frame visuals around: " + messaging.coreMessage;
}

function determineVisualPolishStyle(
  pricePositioning: BusinessIntelligenceObject["pricePositioning"]
): string {
  if (pricePositioning === "premium" || pricePositioning === "value") {
    return "polished, minimal, high-production style with generous negative space";
  }
  if (pricePositioning === "budget") {
    return "vibrant, high-energy style with dense value-forward layout";
  }
  return "clean, professional style with balanced content density";
}

function determineVisualDirection(
  audience: AudienceIntelligenceObject,
  business: BusinessIntelligenceObject
): string {
  const emotionKnown = !audience.primaryEmotion.startsWith("UNKNOWN");
  const identityKnown = !audience.identityMotivation.startsWith("UNKNOWN");
  const polishStyle = determineVisualPolishStyle(business.pricePositioning);

  if (!emotionKnown) {
    return "UNKNOWN - insufficient audience data to determine visual direction";
  }

  const parts: string[] = [
    "Visual mood should evoke: " + audience.primaryEmotion,
    "Visual polish level: " + polishStyle,
  ];

  if (identityKnown) {
    parts.push(
      "Brand should hold high visual prominence to reinforce the identity motivation: " + audience.identityMotivation
    );
  }

  return parts.join(". ");
}

function determineStoryArc(
  messaging: MessagingStrategyObject,
  offer: OfferIntelligenceObject
): string {
  const hookKnown = !messaging.hookStrategy.startsWith("UNKNOWN");
  const riskReversalKnown = !offer.riskReversalRecommendation.startsWith("UNKNOWN");
  const ctaKnown = !messaging.ctaDirection.startsWith("UNKNOWN");

  if (!hookKnown && !riskReversalKnown && !ctaKnown) {
    return "UNKNOWN - insufficient data to determine story arc";
  }

  const parts: string[] = [];
  if (hookKnown) {
    parts.push("Open with: " + messaging.hookStrategy);
  }
  if (riskReversalKnown) {
    parts.push("Place trust and proof elements before the midpoint, reinforcing: " + offer.riskReversalRecommendation);
  }
  if (ctaKnown) {
    parts.push("Close on the CTA direction: " + messaging.ctaDirection);
  }

  return parts.join(". ");
}

function determineEmotionalJourney(audience: AudienceIntelligenceObject): string[] {
  const emotionKnown = !audience.primaryEmotion.startsWith("UNKNOWN");
  const identityKnown = !audience.identityMotivation.startsWith("UNKNOWN");

  if (!emotionKnown && !identityKnown) {
    return ["UNKNOWN - insufficient audience data to determine emotional journey"];
  }

  const journey: string[] = [];
  if (emotionKnown) {
    journey.push("Opens on: " + audience.primaryEmotion);
  }
  if (identityKnown) {
    journey.push("Resolves toward: " + audience.identityMotivation);
  }

  return journey;
}

function determineFormatRecommendations(
  business: BusinessIntelligenceObject,
  offer: OfferIntelligenceObject,
  competitor: CompetitorIntelligenceObject
): Record<string, string> {
  const recommendations: Record<string, string> = {};

  recommendations.assetType =
    business.offerStrengthScore >= 7
      ? "video - offer strength score of " + business.offerStrengthScore + "/10 supports a fuller narrative format"
      : "image - static format sufficient for current offer strength score of " + business.offerStrengthScore + "/10";

  if (!offer.urgencyMechanism.startsWith("UNKNOWN")) {
    recommendations.urgencyFormat = offer.urgencyMechanism.startsWith("Exclusivity-based")
      ? "carousel or static format emphasizing exclusivity"
      : "story or short-form format to match a limited-time window";
  } else {
    recommendations.urgencyFormat = "UNKNOWN - urgency mechanism not established upstream";
  }

  if (!competitor.competitorAngle.startsWith("UNKNOWN")) {
    recommendations.competitiveFormatNote =
      competitor.competitorAngle === "Feature-led product positioning"
        ? "favor identity or lifestyle imagery over feature callouts to differentiate from competitors"
        : "differentiate format from the dominant competitor angle: " + competitor.competitorAngle;
  } else {
    recommendations.competitiveFormatNote = "UNKNOWN - competitor angle not established upstream";
  }

  return recommendations;
}

// ============================================================
// PUBLIC API
// ============================================================

export function decideCreativeStrategy(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>,
  messaging: IntelligenceModuleResult<MessagingStrategyObject>
): IntelligenceModuleResult<CreativeStrategyObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;
  const messagingData = messaging.findings;

  const creativeAngle = determineCreativeAngle(positioningData, messagingData);
  const visualDirection = determineVisualDirection(audienceData, businessData);
  const storyArc = determineStoryArc(messagingData, offerData);
  const emotionalJourney = determineEmotionalJourney(audienceData);
  const formatRecommendations = determineFormatRecommendations(
    businessData,
    offerData,
    competitorData
  );

  const findings: CreativeStrategyObject = {
    creativeAngle,
    formatRecommendations,
    visualDirection,
    storyArc,
    emotionalJourney,
  };

  const unknowns: string[] = [];
  if (creativeAngle.startsWith("UNKNOWN")) {
    unknowns.push("Creative angle could not be determined");
  }
  if (visualDirection.startsWith("UNKNOWN")) {
    unknowns.push("Visual direction could not be determined");
  }
  if (storyArc.startsWith("UNKNOWN")) {
    unknowns.push("Story arc could not be determined");
  }
  if (emotionalJourney.length === 1 && emotionalJourney[0].startsWith("UNKNOWN")) {
    unknowns.push("Emotional journey could not be determined");
  }
  if (formatRecommendations.urgencyFormat.startsWith("UNKNOWN")) {
    unknowns.push("Urgency-based format recommendation could not be determined");
  }
  if (formatRecommendations.competitiveFormatNote.startsWith("UNKNOWN")) {
    unknowns.push("Competitive format differentiation could not be determined");
  }

  const evidence: string[] = [
    "Creative angle derived from winning angle and core message (Positioning Engine + Messaging Strategy)",
    "Visual direction derived from primary emotion, price positioning, and identity motivation (Audience Intelligence + Business Intelligence)",
    "Story arc derived from hook strategy, risk reversal recommendation, and CTA direction (Messaging Strategy + Offer Intelligence)",
    "Emotional journey derived from primary emotion and identity motivation (Audience Intelligence)",
    "Asset type recommendation derived from offer strength score: " + businessData.offerStrengthScore + "/10 (Business Intelligence)",
    "Urgency and competitive format notes derived from urgency mechanism and competitor angle (Offer Intelligence + Competitor Intelligence)",
  ];

  const hasCritical =
    creativeAngle.startsWith("UNKNOWN") && visualDirection.startsWith("UNKNOWN");
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
      messaging.confidence) /
    6;
  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "CreativeStrategy",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Creative angle: " + creativeAngle,
      "Asset type: " + formatRecommendations.assetType,
      "Story arc: " + storyArc,
    ],
    findings,
  };
}