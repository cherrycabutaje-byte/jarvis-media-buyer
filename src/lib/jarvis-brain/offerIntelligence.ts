/**
 * JARVIS Brain - Module 4: Offer Intelligence Engine
 * Architecture V4.3 Engineering Baseline
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Understands the OFFER only. Does not decide positioning, messaging,
 *   headlines, hooks, CTAs, frameworks, campaign strategy, creative
 *   direction, or platform selection.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 *
 * DEPENDENCY: types.ts only. Consumes upstream module outputs through
 * their public IntelligenceModuleResult<T> contract only.
 */

import type {
  BusinessIntelligenceObject,
  AudienceIntelligenceObject,
  CompetitorIntelligenceObject,
  OfferIntelligenceObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Determines the offer frame: why the offer is compelling,
 * built strictly from the business value proposition and the
 * competitive unfair advantage already established upstream.
 */
function determineOfferFrame(
  business: BusinessIntelligenceObject,
  competitor: CompetitorIntelligenceObject
): string {
  const coreValueKnown = !business.coreValueProposition.startsWith("UNKNOWN");
  const advantageKnown = !competitor.unfairAdvantage.startsWith("UNKNOWN");

  if (!coreValueKnown && !advantageKnown) {
    return "UNKNOWN - insufficient data to frame the offer";
  }
  if (coreValueKnown && advantageKnown) {
    return "Frame around: " + competitor.unfairAdvantage + " - delivered through: " + business.coreValueProposition;
  }
  if (coreValueKnown) {
    return "Frame around core value proposition: " + business.coreValueProposition;
  }
  return "Frame around unfair advantage: " + competitor.unfairAdvantage;
}

/**
 * Assesses clarity of the value stack from key differentiators.
 */
function assessValueStackClarity(business: BusinessIntelligenceObject): string {
  const validDifferentiators = business.keyDifferentiators.filter(
    (d) => !d.startsWith("UNKNOWN")
  );

  if (validDifferentiators.length === 0) {
    return "UNKNOWN - no differentiators available to assess value stack";
  }
  if (validDifferentiators.length >= 3) {
    return "Value stack clearly defined across " + validDifferentiators.length + " differentiators";
  }
  return "Value stack partially defined - only " + validDifferentiators.length + " differentiator(s) available";
}

/**
 * Builds price justification strategy from price positioning
 * and offer strength score.
 */
function determinePriceJustificationStrategy(
  business: BusinessIntelligenceObject
): string {
  const strength = business.offerStrengthScore;
  const positioning = business.pricePositioning;

  if (positioning === "budget") {
    return "Justify via accessibility and low-risk entry price point";
  }
  if (positioning === "mid-market") {
    return "Justify via balanced value-to-cost ratio";
  }
  if (positioning === "premium") {
    return strength >= 6
      ? "Justify via superior quality and differentiation supporting premium price"
      : "Premium price positioning is currently under-supported - offer strength score of " + strength + "/10 is insufficient to justify premium framing alone";
  }
  return "Justify via best-in-class return relative to price";
}

/**
 * Detects the dominant objection signal from the audience's
 * stated core objections via pattern matching on their own
 * text - classifies existing objections, does not invent new ones.
 */
function detectDominantObjectionSignal(objections: string[]): string {
  const text = objections.join(" ").toLowerCase();
  if (/price|afford|cost|expensive|worth/.test(text)) return "price_objection";
  if (/safe|danger|risk|hurt|harm/.test(text)) return "safety_objection";
  if (/work|actually|scam|legit|trust/.test(text)) return "credibility_objection";
  if (/time|busy|effort/.test(text)) return "effort_objection";
  return "unclassified_objection";
}

/**
 * Recommends a risk reversal mechanism grounded in the
 * audience's stated deepest fear and dominant objection signal.
 */
function determineRiskReversalRecommendation(
  audience: AudienceIntelligenceObject
): string {
  if (audience.deepestFear.startsWith("UNKNOWN")) {
    return "UNKNOWN - insufficient audience data to recommend risk reversal";
  }

  const signal = detectDominantObjectionSignal(audience.coreObjections);
  const fearClause = "Must directly address the fear that: " + audience.deepestFear;

  if (signal === "price_objection") {
    return "Money-back guarantee tied to price risk. " + fearClause;
  }
  if (signal === "safety_objection") {
    return "Safety or satisfaction guarantee tied to risk of harm. " + fearClause;
  }
  if (signal === "credibility_objection") {
    return "Proof-backed guarantee to counter skepticism. " + fearClause;
  }
  if (signal === "effort_objection") {
    return "Low-effort guarantee removing time or setup risk. " + fearClause;
  }
  return "General satisfaction guarantee recommended. " + fearClause;
}

/**
 * Recommends an urgency mechanism type based on offer strength
 * and price positioning. Does not invent a specific deadline,
 * discount, or campaign detail - that belongs to later modules.
 */
function determineUrgencyMechanism(
  business: BusinessIntelligenceObject
): string {
  if (business.offerStrengthScore <= 4) {
    return "UNKNOWN - offer strength score of " + business.offerStrengthScore + "/10 is too low to recommend an urgency mechanism confidently";
  }

  if (business.pricePositioning === "premium" || business.pricePositioning === "value") {
    return "Exclusivity-based urgency - limited availability or limited cohort framing";
  }
  return "Time-based urgency - limited-time pricing or bonus window";
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Runs the Offer Intelligence Engine.
 *
 * Consumes the public IntelligenceModuleResult<T> contract from
 * Business Intelligence, Audience Intelligence, and Competitor
 * Intelligence. Understands the strength and structure of the
 * offer only - makes no positioning, messaging, or campaign
 * decisions.
 *
 * @param business - Output of Business Intelligence Engine
 * @param audience - Output of Audience Intelligence Engine
 * @param competitor - Output of Competitor Intelligence Engine
 * @returns IntelligenceModuleResult<OfferIntelligenceObject>
 */
export function analyzeOfferIntelligence(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  audience: IntelligenceModuleResult<AudienceIntelligenceObject>,
  competitor: IntelligenceModuleResult<CompetitorIntelligenceObject>
): IntelligenceModuleResult<OfferIntelligenceObject> {
  // Single unwrap point - only businessData/audienceData/competitorData
  // are used from here on.
  const businessData = business.findings;
  const audienceData = audience.findings;
  const competitorData = competitor.findings;

  const offerFrame = determineOfferFrame(businessData, competitorData);
  const valueStackClarity = assessValueStackClarity(businessData);
  const priceJustificationStrategy = determinePriceJustificationStrategy(businessData);
  const riskReversalRecommendation = determineRiskReversalRecommendation(audienceData);
  const urgencyMechanism = determineUrgencyMechanism(businessData);

  const findings: OfferIntelligenceObject = {
    _module: "OfferIntelligence",
    offerFrame,
    valueStackClarity,
    priceJustificationStrategy,
    riskReversalRecommendation,
    urgencyMechanism,
  };

  const unknowns: string[] = [];
  if (offerFrame.startsWith("UNKNOWN")) {
    unknowns.push("Offer frame could not be determined");
  }
  if (valueStackClarity.startsWith("UNKNOWN")) {
    unknowns.push("Value stack clarity could not be assessed");
  }
  if (riskReversalRecommendation.startsWith("UNKNOWN")) {
    unknowns.push("Risk reversal recommendation could not be determined");
  }
  if (urgencyMechanism.startsWith("UNKNOWN")) {
    unknowns.push("Urgency mechanism could not be recommended");
  }

  const evidence: string[] = [
    "Offer strength score: " + businessData.offerStrengthScore + "/10 (Business Intelligence)",
    "Price positioning: " + businessData.pricePositioning + " (Business Intelligence)",
    "Deepest audience fear: " + audienceData.deepestFear + " (Audience Intelligence)",
    "Unfair advantage: " + competitorData.unfairAdvantage + " (Competitor Intelligence)",
  ];

  const hasCritical =
    offerFrame.startsWith("UNKNOWN") && riskReversalRecommendation.startsWith("UNKNOWN");
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const upstreamConfidenceAverage =
    (business.confidence + audience.confidence + competitor.confidence) / 3;
  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(upstreamConfidenceAverage - unknownPenalty, 1.0)
  );

  return {
    module: "OfferIntelligence",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Lead offer frame: " + offerFrame,
      "Risk reversal: " + riskReversalRecommendation,
      "Urgency mechanism: " + urgencyMechanism,
    ],
    findings,
  };
}