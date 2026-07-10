/**
 * JARVIS Brain - Module 6: Messaging Strategy
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is a Decision Module. It does not discover facts, analyze
 * businesses, audiences, or competitors, or evaluate offers. It
 * consumes previously generated intelligence and positioning
 * decisions and converts them into a communication strategy -
 * HOW JARVIS should communicate. It does not generate copy.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Decides communication strategy only. Does not generate headlines,
 *   hooks, ad copy, landing page copy, email copy, social captions,
 *   CTAs, creative layouts, images, videos, or platform-specific assets.
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
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineCoreMessage(positioning: PositioningDecisionObject): string {
  const statementKnown = !positioning.positioningStatement.startsWith("UNKNOWN");
  const angleKnown = !positioning.winningAngle.startsWith("UNKNOWN");

  if (!statementKnown && !angleKnown) {
    return "UNKNOWN - insufficient positioning data to determine core message";
  }
  if (statementKnown && angleKnown) {
    return "Core message: " + positioning.positioningStatement + " Lead with the angle: " + positioning.winningAngle;
  }
  if (statementKnown) {
    return "Core message: " + positioning.positioningStatement;
  }
  return "Core message anchored on the angle: " + positioning.winningAngle;
}

function determineHeadlineDirection(
  audience: AudienceIntelligenceObject,
  positioning: PositioningDecisionObject
): string {
  const triggerKnown = !audience.purchaseTrigger.startsWith("UNKNOWN");
  const diffKnown = !positioning.differentiationStrategy.startsWith("UNKNOWN");

  if (!triggerKnown && !diffKnown) {
    return "UNKNOWN - insufficient data to determine headline direction";
  }
  if (triggerKnown && diffKnown) {
    return "Open on the trigger: " + audience.purchaseTrigger + ". Reveal value in this order: " + positioning.differentiationStrategy;
  }
  if (triggerKnown) {
    return "Open on the trigger: " + audience.purchaseTrigger;
  }
  return "Reveal value in this order: " + positioning.differentiationStrategy;
}

function detectDominantObjectionSignal(objections: string[]): string {
  const text = objections.join(" ").toLowerCase();
  if (/price|afford|cost|expensive|worth/.test(text)) return "price objection";
  if (/safe|danger|risk|hurt|harm/.test(text)) return "safety objection";
  if (/work|actually|scam|legit|trust/.test(text)) return "credibility objection";
  if (/time|busy|effort/.test(text)) return "effort objection";
  return "unclassified objection";
}

function determineHookStrategy(
  audience: AudienceIntelligenceObject,
  offer: OfferIntelligenceObject
): string {
  const emotionKnown = !audience.primaryEmotion.startsWith("UNKNOWN");
  const objectionsKnown =
    audience.coreObjections.length > 0 && !audience.coreObjections[0].startsWith("UNKNOWN");
  const riskReversalKnown = !offer.riskReversalRecommendation.startsWith("UNKNOWN");

  if (!emotionKnown && !objectionsKnown && !riskReversalKnown) {
    return "UNKNOWN - insufficient data to determine hook strategy";
  }

  const parts: string[] = [];
  if (emotionKnown) {
    parts.push("Open emotionally around: " + audience.primaryEmotion);
  }
  if (objectionsKnown) {
    const signal = detectDominantObjectionSignal(audience.coreObjections);
    parts.push("Handle the dominant objection type first: " + signal);
  }
  if (riskReversalKnown) {
    parts.push("Reinforce trust via: " + offer.riskReversalRecommendation);
  }

  return parts.join(". ");
}

function determineCtaDirection(
  positioning: PositioningDecisionObject,
  offer: OfferIntelligenceObject
): string {
  const angleKnown = !positioning.winningAngle.startsWith("UNKNOWN");
  const urgencyKnown = !offer.urgencyMechanism.startsWith("UNKNOWN");

  if (!angleKnown && !urgencyKnown) {
    return "UNKNOWN - insufficient data to determine CTA direction";
  }
  if (angleKnown && urgencyKnown) {
    return "Direct action toward: " + positioning.winningAngle + ", reinforced by: " + offer.urgencyMechanism;
  }
  if (angleKnown) {
    return "Direct action toward: " + positioning.winningAngle;
  }
  return "Reinforce action with: " + offer.urgencyMechanism;
}

function determineToneOfVoice(business: BusinessIntelligenceObject): string[] {
  if (business.pricePositioning === "premium" || business.pricePositioning === "value") {
    return ["confident", "authoritative"];
  }
  if (business.pricePositioning === "budget") {
    return ["friendly", "straightforward"];
  }
  return ["approachable", "trustworthy"];
}

function determineMustSay(
  business: BusinessIntelligenceObject,
  competitor: CompetitorIntelligenceObject
): string[] {
  const mustSay: string[] = [];

  if (!business.coreValueProposition.startsWith("UNKNOWN")) {
    mustSay.push(business.coreValueProposition);
  }

  const validDifferentiators = business.keyDifferentiators.filter(
    (d) => !d.startsWith("UNKNOWN")
  );
  mustSay.push(...validDifferentiators);

  if (!competitor.unfairAdvantage.startsWith("UNKNOWN")) {
    mustSay.push(competitor.unfairAdvantage);
  }

  if (mustSay.length === 0) {
    mustSay.push("UNKNOWN - insufficient data to determine required messaging pillars");
  }

  return mustSay;
}

function determineMustNotSay(
  business: BusinessIntelligenceObject,
  competitor: CompetitorIntelligenceObject
): string[] {
  const mustNotSay: string[] = [];

  const hasRealWeaknesses = !(
    business.primaryWeaknesses.length === 1 &&
    business.primaryWeaknesses[0].startsWith("Sufficient data")
  );
  if (hasRealWeaknesses) {
    mustNotSay.push(
      "Do not overstate claims where structural weaknesses exist: " + business.primaryWeaknesses.join("; ")
    );
  }

  if (!competitor.competitorAngle.startsWith("UNKNOWN")) {
    mustNotSay.push("Do not mirror the saturated competitor angle: " + competitor.competitorAngle);
  }

  if (mustNotSay.length === 0) {
    mustNotSay.push("UNKNOWN - insufficient data to determine messaging guardrails");
  }

  return mustNotSay;
}

// ============================================================
// PUBLIC API
// ============================================================

export function decideMessagingStrategy(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>
): IntelligenceModuleResult<MessagingStrategyObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;

  const coreMessage = determineCoreMessage(positioningData);
  const headlineDirection = determineHeadlineDirection(audienceData, positioningData);
  const hookStrategy = determineHookStrategy(audienceData, offerData);
  const ctaDirection = determineCtaDirection(positioningData, offerData);
  const toneOfVoice = determineToneOfVoice(businessData);
  const mustSay = determineMustSay(businessData, competitorData);
  const mustNotSay = determineMustNotSay(businessData, competitorData);

  const findings: MessagingStrategyObject = {
    coreMessage,
    headlineDirection,
    hookStrategy,
    ctaDirection,
    toneOfVoice,
    mustSay,
    mustNotSay,
  };

  const unknowns: string[] = [];
  if (coreMessage.startsWith("UNKNOWN")) {
    unknowns.push("Core message could not be determined");
  }
  if (headlineDirection.startsWith("UNKNOWN")) {
    unknowns.push("Headline direction could not be determined");
  }
  if (hookStrategy.startsWith("UNKNOWN")) {
    unknowns.push("Hook strategy could not be determined");
  }
  if (ctaDirection.startsWith("UNKNOWN")) {
    unknowns.push("CTA direction could not be determined");
  }
  if (mustSay.length === 1 && mustSay[0].startsWith("UNKNOWN")) {
    unknowns.push("Required messaging pillars could not be determined");
  }
  if (mustNotSay.length === 1 && mustNotSay[0].startsWith("UNKNOWN")) {
    unknowns.push("Messaging guardrails could not be determined");
  }

  const evidence: string[] = [
    "Core message derived from positioning statement and winning angle (Positioning Engine)",
    "Headline direction derived from purchase trigger and differentiation strategy (Audience Intelligence + Positioning Engine)",
    "Hook strategy derived from primary emotion, core objections, and risk reversal recommendation (Audience Intelligence + Offer Intelligence)",
    "CTA direction derived from winning angle and urgency mechanism (Positioning Engine + Offer Intelligence)",
    "Tone of voice derived from price positioning: " + businessData.pricePositioning + " (Business Intelligence)",
    "Message pillars derived from core value proposition, differentiators, and unfair advantage (Business Intelligence + Competitor Intelligence)",
    "Messaging guardrails derived from structural weaknesses and competitor angle (Business Intelligence + Competitor Intelligence)",
  ];

  const hasCritical =
    coreMessage.startsWith("UNKNOWN") && ctaDirection.startsWith("UNKNOWN");
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
      positioning.confidence) /
    5;
  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "MessagingStrategy",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Core message: " + coreMessage,
      "Tone of voice: " + toneOfVoice.join(", "),
      "Hook strategy: " + hookStrategy,
    ],
    findings,
  };
}