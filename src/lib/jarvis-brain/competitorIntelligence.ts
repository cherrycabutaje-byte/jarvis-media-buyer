/**
 * JARVIS Brain - Module 3: Competitor Intelligence Engine
 * Architecture V4.3 Engineering Baseline
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services. No scraping.
 * - No randomness.
 * - Never invent competitor information.
 * - Separate Market Intelligence from Competitor Intelligence.
 * - Return structured findings, not marketing copy.
 * - Unknown values marked explicitly.
 * - Missing competitor data handled gracefully.
 * - No marketing strategy decisions.
 * - All output JSON-serializable for future memory caching.
 *
 * DEPENDENCY: types.ts only.
 */

import type {
  BusinessIntelligenceObject,
  CompetitorInput,
  CompetitorIntelligenceObject,
  IntelligenceModuleResult,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL TYPES
// ============================================================

interface CompetitorSignal {
  signal: string;
  evidence: string;
  confidence: number;
}

interface MarketIntelligence {
  commonAngles: string[];
  typicalWeaknesses: string[];
  commonWhiteSpace: string[];
  confidence: number;
}

// ============================================================
// CATEGORY MARKET INTELLIGENCE
// Pre-defined market patterns per category.
// Used when no competitor data is provided.
// ============================================================

const CATEGORY_MARKET_INTELLIGENCE: Record<string, MarketIntelligence> = {
  "Pet Products": {
    commonAngles: ["convenience", "value for money", "product features"],
    typicalWeaknesses: [
      "Generic feature lists with no emotional hook",
      "No identity-level messaging",
      "Social proof is numbers only with no real stories",
    ],
    commonWhiteSpace: [
      "Safety and protection angle — most competitors ignore guilt and fear",
      "Identity transformation — becoming the responsible pet parent",
      "Specific pet type targeting — most ads speak to all pets generically",
    ],
    confidence: 0.82,
  },
  "Health & Fitness": {
    commonAngles: ["weight loss results", "before and after", "no effort required", "quick results"],
    typicalWeaknesses: [
      "Overused promises that skeptical audiences no longer believe",
      "Ignores the emotional cost of previous failures",
      "Social proof that looks fabricated",
    ],
    commonWhiteSpace: [
      "Honest acknowledgment of previous failure",
      "Identity recovery rather than weight loss",
      "Cultural specificity — most fitness brands are generic",
    ],
    confidence: 0.82,
  },
  "Software & SaaS": {
    commonAngles: ["feature comparison", "time savings", "ROI claims", "ease of use"],
    typicalWeaknesses: [
      "Feature-first messaging ignores buyer emotional state",
      "Social proof is logos only with no real outcomes",
      "Ignores implementation friction and learning curve fear",
    ],
    commonWhiteSpace: [
      "Outcome-first messaging — lead with transformation not features",
      "Acknowledge and dissolve the setup fear",
      "Specific use case targeting rather than broad positioning",
    ],
    confidence: 0.80,
  },
  "Education & Coaching": {
    commonAngles: ["income claims", "lifestyle freedom", "step-by-step systems", "guru authority"],
    typicalWeaknesses: [
      "Skepticism from oversaturated income claims",
      "No differentiation between courses",
      "Authority claims without verifiable proof",
    ],
    commonWhiteSpace: [
      "Honest expectation setting builds trust in a skeptical market",
      "Niche specificity — most courses target everyone",
      "Community and accountability rather than content alone",
    ],
    confidence: 0.80,
  },
  "Marketing & Sales": {
    commonAngles: ["AI-powered", "saves time", "generates copy", "increases conversions"],
    typicalWeaknesses: [
      "Generic AI positioning indistinguishable from ChatGPT",
      "Feature-focused with no intelligence differentiation",
      "No proprietary methodology — just prompts",
    ],
    commonWhiteSpace: [
      "Proprietary intelligence layer — not just an AI wrapper",
      "Campaign-level thinking rather than single asset generation",
      "Industry or niche specificity",
    ],
    confidence: 0.82,
  },
  "Beauty & Skincare": {
    commonAngles: ["clinical ingredients", "before and after results", "dermatologist approved"],
    typicalWeaknesses: [
      "Ingredient claims without emotional resonance",
      "Before and after credibility gap",
      "No acknowledgment of previous product failures",
    ],
    commonWhiteSpace: [
      "Emotional validation before clinical claims",
      "Skin type specificity rather than universal promises",
      "Honest timeline setting — most brands overpromise speed",
    ],
    confidence: 0.78,
  },
  "Finance & Investing": {
    commonAngles: ["passive income", "financial freedom", "proven system"],
    typicalWeaknesses: [
      "Credibility gap from oversaturated income promises",
      "Fear of scams not addressed",
    ],
    commonWhiteSpace: [
      "Safety and risk management rather than upside only",
      "Education-first positioning builds trust before selling",
    ],
    confidence: 0.78,
  },
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

function detectCompetitorSignals(competitors: CompetitorInput[]): CompetitorSignal[] {
  const signals: CompetitorSignal[] = [];
  for (const competitor of competitors) {
    const text = [
      competitor.headline ?? "",
      competitor.bodyCopy ?? "",
      ...(competitor.claims ?? []),
    ].join(" ").toLowerCase();
    if (text.trim().length === 0) continue;
    if (/easy|simple|quick|fast|instant|effortless/.test(text)) {
      signals.push({ signal: "convenience_angle", evidence: `Competitor ${competitor.identifier} uses convenience language`, confidence: 0.80 });
    }
    if (/risk|danger|warning|mistake|wrong|fail|lose|lost/.test(text)) {
      signals.push({ signal: "fear_angle", evidence: `Competitor ${competitor.identifier} uses fear-based language`, confidence: 0.80 });
    }
    if (/customers|users|people|trusted|reviews|rated|stars|testimonial/.test(text)) {
      signals.push({ signal: "social_proof_angle", evidence: `Competitor ${competitor.identifier} leads with social proof`, confidence: 0.75 });
    }
    if (/feature|specification|includes|comes with|built-in/.test(text)) {
      signals.push({ signal: "feature_first_angle", evidence: `Competitor ${competitor.identifier} leads with features`, confidence: 0.75 });
    }
    if (/cheap|affordable|low price|best price|save|discount|deal/.test(text)) {
      signals.push({ signal: "price_competition_angle", evidence: `Competitor ${competitor.identifier} competes on price`, confidence: 0.80 });
    }
  }
  return signals;
}

function deriveCompetitorAngle(signals: CompetitorSignal[]): string {
  if (signals.length === 0) return "UNKNOWN — no competitor data provided";
  const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
  const angleLabels: Record<string, string> = {
    convenience_angle: "Convenience and ease of use",
    fear_angle: "Fear and risk prevention",
    social_proof_angle: "Social proof and credibility",
    feature_first_angle: "Feature-led product positioning",
    price_competition_angle: "Price competition",
  };
  return angleLabels[sorted[0].signal] ?? "UNKNOWN — angle could not be classified";
}

function deriveCompetitorWeakness(signals: CompetitorSignal[], market: MarketIntelligence | undefined): string {
  if (signals.some((s) => s.signal === "feature_first_angle")) {
    return "Feature-led messaging fails to connect emotionally — no identity or transformation angle";
  }
  if (signals.some((s) => s.signal === "price_competition_angle")) {
    return "Price competition creates a race to the bottom — no differentiation beyond cost";
  }
  if (market && market.typicalWeaknesses.length > 0) return market.typicalWeaknesses[0];
  return "UNKNOWN — insufficient data to identify competitor weakness";
}

function identifyWhiteSpace(signals: CompetitorSignal[], market: MarketIntelligence | undefined): string {
  if (signals.some((s) => s.signal === "convenience_angle")) {
    return "Safety and protection positioning — competitors focus on convenience not consequence";
  }
  if (signals.some((s) => s.signal === "feature_first_angle")) {
    return "Identity transformation positioning — competitors sell features not who the buyer becomes";
  }
  if (signals.some((s) => s.signal === "price_competition_angle")) {
    return "Premium value positioning — competitors compete on price leaving quality gap unaddressed";
  }
  if (market && market.commonWhiteSpace.length > 0) return market.commonWhiteSpace[0];
  return "UNKNOWN — insufficient data to identify white space";
}

function buildCounterPositioning(whiteSpace: string, business: BusinessIntelligenceObject): string {
  if (whiteSpace.startsWith("UNKNOWN")) return "UNKNOWN — cannot build counter-positioning without data";
  return `Position ${business.resolvedCategory} product against: ${whiteSpace}`;
}

function determineUnfairAdvantage(business: BusinessIntelligenceObject, signals: CompetitorSignal[]): string {
  const advantages: string[] = [];
  if (business.keyDifferentiators.length > 0 && !business.keyDifferentiators[0].startsWith("UNKNOWN")) {
    advantages.push(business.keyDifferentiators[0]);
  }
  if (signals.some((s) => s.signal === "price_competition_angle") && business.pricePositioning !== "budget") {
    advantages.push("Premium quality positioning while competitors race to the bottom on price");
  }
  if (advantages.length === 0) return "UNKNOWN — insufficient data to determine unfair advantage";
  return advantages.join(" — ");
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Runs the Competitor Intelligence Engine.
 *
 * SEPARATION OF CONCERNS:
 * - Market Intelligence: patterns from category knowledge
 * - Competitor Intelligence: findings from actual competitor data
 *
 * This module makes NO marketing strategy decisions.
 * Missing competitor data handled gracefully via market intelligence.
 *
 * @param business - Output of Business Intelligence Engine
 * @param competitors - Optional competitor inputs (defaults to empty)
 * @returns IntelligenceModuleResult<CompetitorIntelligenceObject>
 */
export function analyzeCompetitorIntelligence(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>,
  competitors: CompetitorInput[] = []
): IntelligenceModuleResult<CompetitorIntelligenceObject> {
  const businessFindings = business.findings;
  const unknowns: string[] = [];
  const evidence: string[] = [];

  const signals = detectCompetitorSignals(competitors);
  const market = CATEGORY_MARKET_INTELLIGENCE[businessFindings.resolvedCategory];

  if (competitors.length > 0) {
    evidence.push(`${competitors.length} competitor input(s) analyzed`);
    evidence.push(`${signals.length} competitor signal(s) detected`);
  } else {
    unknowns.push("No competitor data provided — market intelligence used as fallback");
  }

  if (market) {
    evidence.push(`Market intelligence available for: ${businessFindings.resolvedCategory}`);
  } else {
    unknowns.push(`No market intelligence available for: ${businessFindings.resolvedCategory}`);
  }

  const competitorAngle = deriveCompetitorAngle(signals);
  const competitorWeakness = deriveCompetitorWeakness(signals, market);
  const whiteSpaceOpportunity = identifyWhiteSpace(signals, market);
  const counterPositioning = buildCounterPositioning(whiteSpaceOpportunity, businessFindings);
  const unfairAdvantage = determineUnfairAdvantage(businessFindings, signals);

  if (competitorAngle.startsWith("UNKNOWN")) unknowns.push("Competitor angle could not be determined");
  if (unfairAdvantage.startsWith("UNKNOWN")) unknowns.push("Unfair advantage could not be determined");

  const hasCritical = competitorAngle.startsWith("UNKNOWN") && whiteSpaceOpportunity.startsWith("UNKNOWN");
  const status = hasCritical ? "unknown" : unknowns.length > 0 ? "partial" : "complete";
  const baseConfidence = market?.confidence ?? 0.40;
  const signalBoost = Math.min(signals.length * 0.05, 0.20);
  const confidence = Math.min(baseConfidence + signalBoost, 1.0);

  return {
    module: "CompetitorIntelligence",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      `Use white space: ${whiteSpaceOpportunity}`,
      `Counter-position against: ${competitorAngle}`,
    ],
    findings: {
      _module: "CompetitorIntelligence",
      competitorAngle,
      competitorWeakness,
      whiteSpaceOpportunity,
      counterPositioning,
      unfairAdvantage,
    },
  };
}