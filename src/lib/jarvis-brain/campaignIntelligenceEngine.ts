/**
 * JARVIS Brain - Module 10: Campaign Intelligence Engine
 * Architecture V4.3 Engineering Baseline
 *
 * ARCHITECTURAL NOTE:
 * This is an Optimization Module. It evaluates the completed
 * campaign strategy and execution plan - it does not redesign the
 * campaign and does not generate assets. It determines how the
 * campaign should be tested, measured, and improved.
 *
 * IMPORTANT: This module never claims exact future ROAS, CTR, or
 * revenue. The predictedPerformance.predictedCTR field is typed as
 * a string and is deliberately populated with a qualitative
 * expected-outcome + confidence + risk description, never a literal
 * number or percentage - consistent with the explicit prohibition
 * on exact performance predictions.
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
 * Depends on Campaign Architecture directly, not Variation Engine -
 * Variation Engine is scoped to a single variation's execution
 * package, while this module ranks and evaluates across the full
 * variation set already defined by Campaign Architecture.
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
  CampaignIntelligenceObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function rankVariationsByConfidence(
  variations: VariationDefinition[]
): VariationDefinition[] {
  return [...variations].sort((a, b) => b.confidenceScore - a.confidenceScore);
}

function determineConfidenceBand(score: number): string {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "moderate";
  return "low";
}

function assessRiskLevel(variation: VariationDefinition): string {
  const hasDataGap =
    variation.emotionalAngle.startsWith("UNKNOWN") ||
    variation.visualConcept.startsWith("UNKNOWN");

  if (hasDataGap) {
    return "high - underlying strategic data has gaps";
  }
  if (variation.confidenceScore >= 0.7) {
    return "low";
  }
  if (variation.confidenceScore >= 0.4) {
    return "moderate";
  }
  return "high";
}

function buildTestingStrategy(
  rankedVariations: VariationDefinition[]
): CampaignIntelligenceObject["testingStrategy"] {
  const describePhase = (variation: VariationDefinition | undefined): string => {
    if (!variation) {
      return "UNKNOWN - insufficient variations to plan this phase";
    }
    return (
      "Test " + variation.id + " (" + variation.label + ") - confidence ranking: " +
      determineConfidenceBand(variation.confidenceScore) +
      ". Hypothesis: the " + variation.framework +
      " framework will resonate most strongly with this variation's audience segment (" +
      variation.audienceSegment +
      "). Success criteria: stronger relative engagement compared to the other variations in this test, not a fixed absolute target."
    );
  };

  return {
    phase1: describePhase(rankedVariations[0]),
    phase2: describePhase(rankedVariations[1]),
    phase3: describePhase(rankedVariations[2]),
  };
}

function buildPredictedPerformance(
  variations: VariationDefinition[]
): CampaignIntelligenceObject["predictedPerformance"] {
  const performance: CampaignIntelligenceObject["predictedPerformance"] = {};

  for (const variation of variations) {
    const confidenceBand = determineConfidenceBand(variation.confidenceScore);
    const risk = assessRiskLevel(variation);

    performance[variation.id] = {
      predictedCTR:
        "Expected outcome: " + confidenceBand +
        " relative engagement for a " + variation.label +
        " asset. Confidence: " + confidenceBand +
        ". Risk: " + risk + ".",
      audienceType: variation.audienceSegment,
    };
  }

  return performance;
}

function buildRecommendationReasons(
  variations: VariationDefinition[]
): string[] {
  const reasons: string[] = [];

  const frameworks = variations.map((v) => v.framework).join(", ");
  reasons.push(
    "KPI focus: prioritize relative engagement and click-through behavior for early-funnel variations, and conversion-oriented signals for late-funnel variations"
  );
  reasons.push(
    "Learning priority: determine which marketing framework among [" + frameworks + "] performs best for this audience before scaling spend"
  );

  const highRiskVariations = variations.filter(
    (v) => assessRiskLevel(v).startsWith("high")
  );
  if (highRiskVariations.length > 0) {
    reasons.push(
      "Optimization opportunity: gather real audience and creative data for " +
      highRiskVariations.map((v) => v.id).join(", ") +
      " before allocating meaningful budget - underlying strategic data currently has gaps"
    );
    reasons.push(
      "Risk assessment: " + highRiskVariations.length + " of " + variations.length +
      " variations carry elevated risk due to upstream data gaps"
    );
  } else {
    reasons.push(
      "Optimization opportunity: all variations are grounded in resolved upstream data - optimize by reallocating budget toward the highest-confidence variation once initial signal is observed"
    );
    reasons.push(
      "Risk assessment: all variations show acceptable data grounding; no elevated data-gap risk detected"
    );
  }

  reasons.push(
    "Measurement framework: track variations relationally against each other in this first testing wave rather than against fixed external benchmarks, since no historical account performance data is available upstream"
  );

  return reasons;
}

// ============================================================
// PUBLIC API
// ============================================================

export function evaluateCampaignIntelligence(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>,
  offer: IntelligenceModuleResult<OfferIntelligenceObject>,
  positioning: IntelligenceModuleResult<PositioningDecisionObject>,
  messaging: IntelligenceModuleResult<MessagingStrategyObject>,
  creative: IntelligenceModuleResult<CreativeStrategyObject>,
  campaign: IntelligenceModuleResult<CampaignArchitectureObject>
): IntelligenceModuleResult<CampaignIntelligenceObject> {
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;
  const offerData = offer.findings;
  const positioningData = positioning.findings;
  const messagingData = messaging.findings;
  const creativeData = creative.findings;
  const campaignData = campaign.findings;

  const rankedVariations = rankVariationsByConfidence(campaignData.variations);
  const topVariation = rankedVariations[0];

  const recommendedVariation = topVariation
    ? topVariation.id
    : "UNKNOWN - no variations available to rank";

  const testingStrategy = buildTestingStrategy(rankedVariations);
  const predictedPerformance = buildPredictedPerformance(campaignData.variations);
  const recommendationReasons = buildRecommendationReasons(campaignData.variations);

  const findings: CampaignIntelligenceObject = {
    recommendedVariation,
    confidenceScore: topVariation ? topVariation.confidenceScore : 0.2,
    recommendationReasons,
    testingStrategy,
    predictedPerformance,
  };

  const unknowns: string[] = [];
  if (recommendedVariation.startsWith("UNKNOWN")) {
    unknowns.push("No variations were available to recommend or rank");
  }
  const highRiskVariations = campaignData.variations.filter((v) =>
    assessRiskLevel(v).startsWith("high")
  );
  for (const variation of highRiskVariations) {
    unknowns.push(
      variation.id + ": strategic data has gaps, elevating risk for this variation"
    );
  }

  const evidence: string[] = [
    "Variation ranking derived from confidenceScore already established in Campaign Architecture",
    "Recommended variation is the highest-ranked by confidence: " + recommendedVariation,
    "Risk levels derived from confidence score plus presence of UNKNOWN markers in each variation's emotional angle and visual concept",
    "Testing strategy phases ordered by confidence ranking, not necessarily original funnel order",
    "Predicted performance expressed qualitatively (expected outcome, confidence band, risk level) - no exact CTR, ROAS, or revenue figures are claimed",
  ];

  const hasCritical = recommendedVariation.startsWith("UNKNOWN");
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const upstreamConfidenceAverage =
    campaignData.variations.length > 0
      ? campaignData.variations.reduce((sum, v) => sum + v.confidenceScore, 0) /
        campaignData.variations.length
      : 0.2;
  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "CampaignIntelligence",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Recommended variation to roll out first: " + recommendedVariation,
      "Testing order: phase1 -> phase2 -> phase3, as detailed in testingStrategy",
      "Proceed to Product Structure Engine with this evaluation",
    ],
    findings,
  };
}