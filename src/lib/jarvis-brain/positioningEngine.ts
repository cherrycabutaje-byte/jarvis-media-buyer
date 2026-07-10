/**
 * JARVIS Brain - Module 5: Positioning Engine
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is the first Decision Module. Prior modules (Business,
 * Audience, Competitor, Offer Intelligence) observe and describe
 * reality. Positioning Engine synthesizes that intelligence into
 * a strategic positioning decision. Decision Modules use the same
 * universal ModuleResult<T> contract as Intelligence Modules -
 * module type is identified by the `module` metadata field, not
 * by a separate wrapper type.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Decides positioning only. Does not generate headlines, hooks,
 *   copy, CTAs, campaigns, creative direction, or platform choices.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
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
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineWinningAngle(
  competitor: CompetitorIntelligenceObject,
  offer: OfferIntelligenceObject
): string {
  const whiteSpaceKnown = !competitor.whiteSpaceOpportunity.startsWith("UNKNOWN");
  const offerFrameKnown = !offer.offerFrame.startsWith("UNKNOWN");

  if (!whiteSpaceKnown && !offerFrameKnown) {
    return "UNKNOWN - insufficient data to determine a winning market angle";
  }
  if (whiteSpaceKnown && offerFrameKnown) {
    return "Attack the white space of: " + competitor.whiteSpaceOpportunity + " - earned through: " + offer.offerFrame;
  }
  if (whiteSpaceKnown) {
    return "Attack the white space of: " + competitor.whiteSpaceOpportunity;
  }
  return "Lead with: " + offer.offerFrame;
}

function buildPositioningStatement(
  business: BusinessIntelligenceObject,
  audience: AudienceIntelligenceObject
): string {
  const personaKnown = !audience.primaryPersona.startsWith("UNKNOWN");
  const categoryKnown = business.resolvedCategory !== "UNKNOWN";
  const valueKnown = !business.coreValueProposition.startsWith("UNKNOWN");

  if (!personaKnown || !categoryKnown || !valueKnown) {
    return "UNKNOWN - insufficient data across persona, category, and value proposition to construct a positioning statement";
  }

  return (
    "For " + audience.primaryPersona +
    ", this " + business.resolvedCategory +
    " offer delivers " + business.coreValueProposition +
    ", addressing the trigger: " + audience.purchaseTrigger
  );
}

function determineCategoryReframe(
  business: BusinessIntelligenceObject,
  competitor: CompetitorIntelligenceObject
): string {
  if (business.resolvedCategory === "UNKNOWN") {
    return "UNKNOWN - category could not be resolved upstream, cannot reframe";
  }
  if (competitor.competitorWeakness.startsWith("UNKNOWN")) {
    return "UNKNOWN - competitor weakness not established, cannot determine reframe";
  }
  return (
    "Reframe " + business.resolvedCategory +
    " away from the market's typical weakness: " + competitor.competitorWeakness
  );
}

function determineDifferentiationStrategy(
  business: BusinessIntelligenceObject,
  competitor: CompetitorIntelligenceObject,
  offer: OfferIntelligenceObject
): string {
  const validDifferentiators = business.keyDifferentiators.filter(
    (d) => !d.startsWith("UNKNOWN")
  );
  const advantageKnown = !competitor.unfairAdvantage.startsWith("UNKNOWN");

  if (validDifferentiators.length === 0 && !advantageKnown) {
    return "UNKNOWN - no differentiators or unfair advantage established to build a differentiation strategy";
  }

  const parts: string[] = [];
  if (advantageKnown) {
    parts.push("Lead competitively with: " + competitor.unfairAdvantage);
  }
  if (validDifferentiators.length > 0) {
    parts.push("Support with differentiators: " + validDifferentiators.join(", "));
  }
  if (!offer.valueStackClarity.startsWith("UNKNOWN")) {
    parts.push("Value stack status: " + offer.valueStackClarity);
  }

  return parts.join(". ");
}

// ============================================================
// PUBLIC API
// ============================================================

export function decidePositioning(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>
): IntelligenceModuleResult<PositioningDecisionObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;

  const winningAngle = determineWinningAngle(competitorData, offerData);
  const positioningStatement = buildPositioningStatement(businessData, audienceData);
  const categoryReframe = determineCategoryReframe(businessData, competitorData);
  const differentiationStrategy = determineDifferentiationStrategy(
    businessData,
    competitorData,
    offerData
  );

  const findings: PositioningDecisionObject = {
    winningAngle,
    positioningStatement,
    categoryReframe,
    differentiationStrategy,
  };

  const unknowns: string[] = [];
  if (winningAngle.startsWith("UNKNOWN")) {
    unknowns.push("Winning angle could not be determined");
  }
  if (positioningStatement.startsWith("UNKNOWN")) {
    unknowns.push("Positioning statement could not be constructed");
  }
  if (categoryReframe.startsWith("UNKNOWN")) {
    unknowns.push("Category reframe could not be determined");
  }
  if (differentiationStrategy.startsWith("UNKNOWN")) {
    unknowns.push("Differentiation strategy could not be determined");
  }

  const evidence: string[] = [
    "Winning angle derived from white-space opportunity and offer frame (Competitor + Offer Intelligence)",
    "Positioning statement derived from persona, category, and core value proposition (Audience + Business Intelligence)",
    "Category reframe derived from resolved category and competitor weakness (Business + Competitor Intelligence)",
    "Differentiation strategy derived from key differentiators, unfair advantage, and value stack clarity (Business + Competitor + Offer Intelligence)",
  ];

  const hasCritical =
    winningAngle.startsWith("UNKNOWN") && positioningStatement.startsWith("UNKNOWN");
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const upstreamConfidenceAverage =
    (business.confidence + audience.confidence + competitor.confidence + offer.confidence) / 4;
  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "PositioningEngine",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Winning angle: " + winningAngle,
      "Differentiation strategy: " + differentiationStrategy,
    ],
    findings,
  };
}