/**
 * JARVIS Brain - Module 2: Audience Intelligence Engine
 * Architecture V4.3 Engineering Baseline
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Receives BusinessIntelligenceObject as input.
 * - Does NOT import from businessIntelligence.ts.
 * - Does NOT make marketing strategy decisions.
 * - Only understands the audience.
 * - Unknown values marked explicitly.
 * - All objects are JSON-serializable for future memory caching.
 *
 * DEPENDENCY: types.ts only.
 */

import type {
  BusinessIntelligenceObject,
  AudienceIntelligenceObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL TYPES
// ============================================================

interface AudienceSignal {
  /** The signal detected */
  signal: string;
  /** Source of evidence */
  evidence: string;
  /** How confident we are (0-1) */
  confidence: number;
}

// ============================================================
// CATEGORY AUDIENCE PROFILES
// Pre-defined audience profiles per product category.
// These are knowledge rules, not AI inference.
// ============================================================

interface CategoryAudienceProfile {
  primaryPersona: string;
  primaryEmotion: string;
  purchaseTrigger: string;
  coreObjections: string[];
  awarenessLevel: AudienceIntelligenceObject["awarenessLevel"];
  identityMotivation: string;
  deepestFear: string;
  confidence: number;
}

const CATEGORY_AUDIENCE_PROFILES: Record<string, CategoryAudienceProfile> = {
  "Pet Products": {
    primaryPersona: "Pet owner aged 25-45 who treats their pet as a family member",
    primaryEmotion: "Protective love mixed with guilt",
    purchaseTrigger: "Fear of being a negligent pet owner or harm coming to their pet",
    coreObjections: [
      "Is this product safe for my pet?",
      "Is this worth the price?",
      "Will my pet actually use this?"
    ],
    awarenessLevel: "solution-aware",
    identityMotivation: "To be the responsible, caring pet parent who never lets anything bad happen",
    deepestFear: "Being the owner whose pet got hurt because they did not prepare",
    confidence: 0.85,
  },
  "Health & Fitness": {
    primaryPersona: "Adult aged 25-45 who wants to lose weight or build a healthier body",
    primaryEmotion: "Shame and frustrated hope after repeated failures",
    purchaseTrigger: "A triggering event — photo, comment, health scare, or milestone birthday",
    coreObjections: [
      "I have tried everything and nothing works",
      "I do not have time for this",
      "This is probably just another scam"
    ],
    awarenessLevel: "solution-aware",
    identityMotivation: "To become the version of themselves they remember or have always imagined",
    deepestFear: "That they are fundamentally incapable of change",
    confidence: 0.85,
  },
  "Education & Coaching": {
    primaryPersona: "Ambitious professional or entrepreneur aged 25-50 seeking career or income growth",
    primaryEmotion: "Frustrated ambition — they know what they want but cannot get there alone",
    purchaseTrigger: "Realization that their current path will not get them where they want to go",
    coreObjections: [
      "Will this actually work for me?",
      "I cannot afford this right now",
      "I do not have time to learn something new"
    ],
    awarenessLevel: "problem-aware",
    identityMotivation: "To become the person who achieved what others said was impossible",
    deepestFear: "Wasting money on another course that changes nothing",
    confidence: 0.80,
  },
  "Software & SaaS": {
    primaryPersona: "Business owner, marketer, or professional aged 25-55 trying to save time or grow revenue",
    primaryEmotion: "Overwhelm from too many tools and not enough results",
    purchaseTrigger: "A specific bottleneck or inefficiency they can no longer ignore",
    coreObjections: [
      "How hard is this to set up?",
      "Will this actually integrate with what I use?",
      "Is this company going to be around in 12 months?"
    ],
    awarenessLevel: "solution-aware",
    identityMotivation: "To be the smart operator who builds systems instead of trading time for money",
    deepestFear: "Paying for another tool that collects dust",
    confidence: 0.80,
  },
  "Beauty & Skincare": {
    primaryPersona: "Woman aged 20-45 who wants to feel confident and attractive in her own skin",
    primaryEmotion: "Self-consciousness and desire for visible, validatable results",
    purchaseTrigger: "A specific skin concern becoming impossible to ignore or hide",
    coreObjections: [
      "Will this work on my skin type?",
      "I have wasted money on products that promised the same thing",
      "How long until I see results?"
    ],
    awarenessLevel: "product-aware",
    identityMotivation: "To be someone who looks as good as they feel — or better",
    deepestFear: "That their skin problem is permanent and nothing will actually fix it",
    confidence: 0.80,
  },
  "Marketing & Sales": {
    primaryPersona: "Business owner or marketer aged 25-50 trying to grow revenue",
    primaryEmotion: "Anxiety about money and frustration at campaigns that do not convert",
    purchaseTrigger: "Wasted ad spend with no results or a competitor suddenly outperforming them",
    coreObjections: [
      "Is this just another generic AI tool?",
      "How is this different from ChatGPT?",
      "Will this work for my specific industry?"
    ],
    awarenessLevel: "solution-aware",
    identityMotivation: "To be the marketer who finally figured out what everyone else is missing",
    deepestFear: "That they are permanently behind their competitors and cannot catch up",
    confidence: 0.80,
  },
  "Finance & Investing": {
    primaryPersona: "Adult aged 25-55 seeking financial security or passive income",
    primaryEmotion: "Fear of financial insecurity mixed with hope for freedom",
    purchaseTrigger: "A financial shock or the realization that their current trajectory is insufficient",
    coreObjections: [
      "Is this legitimate or a scam?",
      "What if I lose my money?",
      "Is this too complicated for me?"
    ],
    awarenessLevel: "problem-aware",
    identityMotivation: "To achieve the financial freedom that removes anxiety from daily life",
    deepestFear: "Reaching retirement with insufficient savings and no options",
    confidence: 0.78,
  },
  "Fashion & Apparel": {
    primaryPersona: "Style-conscious adult aged 18-40 who uses clothing as self-expression",
    primaryEmotion: "Desire to be seen as stylish, current, and put-together",
    purchaseTrigger: "A social event, season change, or seeing a style they want to emulate",
    coreObjections: [
      "Will this fit me correctly?",
      "Is the quality worth the price?",
      "Will this still look good after washing?"
    ],
    awarenessLevel: "product-aware",
    identityMotivation: "To project an image that matches how they see themselves",
    deepestFear: "Being seen as unfashionable or behind the times",
    confidence: 0.75,
  },
  "Food & Beverage": {
    primaryPersona: "Health-conscious consumer or food enthusiast aged 20-50",
    primaryEmotion: "Desire for pleasure without guilt",
    purchaseTrigger: "A health goal, social occasion, or discovering something new",
    coreObjections: [
      "Does this actually taste good?",
      "Is this healthy enough to justify the purchase?",
      "Is this worth the premium over regular options?"
    ],
    awarenessLevel: "product-aware",
    identityMotivation: "To be someone who makes good choices without sacrificing enjoyment",
    deepestFear: "Making a change that makes life less enjoyable",
    confidence: 0.72,
  },
  "Home & Living": {
    primaryPersona: "Homeowner or renter aged 25-50 who wants a comfortable, beautiful living space",
    primaryEmotion: "Pride of ownership and desire for a home that reflects their taste",
    purchaseTrigger: "Moving, redecorating, or a specific functional need that creates discomfort",
    coreObjections: [
      "Will this fit my space?",
      "Is the quality durable enough?",
      "Does this match what I already have?"
    ],
    awarenessLevel: "solution-aware",
    identityMotivation: "To live in a space that feels intentional, curated, and uniquely theirs",
    deepestFear: "Wasting money on something that looks wrong or breaks quickly",
    confidence: 0.72,
  },
};

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Detects audience signals from business intelligence.
 * Returns signals with evidence and confidence.
 */
function detectAudienceSignals(
  business: BusinessIntelligenceObject
): AudienceSignal[] {
  const signals: AudienceSignal[] = [];

  // Signal: Category match
  if (business.resolvedCategory !== "UNKNOWN") {
    signals.push({
      signal: "category_known",
      evidence: `Category resolved as: ${business.resolvedCategory}`,
      confidence: 0.90,
    });
  }

  // Signal: Offer strength indicates market maturity
  if (business.offerStrengthScore >= 7) {
    signals.push({
      signal: "mature_offer",
      evidence: `Offer strength score ${business.offerStrengthScore}/10 indicates established product`,
      confidence: 0.75,
    });
  }

  // Signal: Premium pricing narrows audience
  if (business.pricePositioning === "premium") {
    signals.push({
      signal: "premium_audience",
      evidence: `Premium price positioning suggests quality-conscious buyer`,
      confidence: 0.80,
    });
  }

  // Signal: Budget pricing broadens audience
  if (business.pricePositioning === "budget") {
    signals.push({
      signal: "price_sensitive_audience",
      evidence: `Budget price positioning suggests price-sensitive buyer`,
      confidence: 0.75,
    });
  }

  return signals;
}

/**
 * Adjusts the base profile based on detected signals.
 * Applies price positioning and offer strength modifiers.
 */
function applySignalModifiers(
  profile: CategoryAudienceProfile,
  signals: AudienceSignal[],
  business: BusinessIntelligenceObject
): CategoryAudienceProfile {
  let adjusted = { ...profile };

  // Premium pricing = more aware audience
  const isPremium = signals.some((s) => s.signal === "premium_audience");
  if (isPremium && adjusted.awarenessLevel === "problem-aware") {
    adjusted.awarenessLevel = "solution-aware";
  }

  // Low offer strength = audience may need more education
  if (business.offerStrengthScore <= 4) {
    adjusted.coreObjections = [
      ...adjusted.coreObjections,
      "I do not fully understand what I am getting",
    ];
  }

  return adjusted;
}

/**
 * Builds the unknown fallback profile.
 * Used when category cannot be resolved.
 */
function buildUnknownProfile(): CategoryAudienceProfile {
  return {
    primaryPersona: "UNKNOWN — category could not be resolved from available data",
    primaryEmotion: "UNKNOWN — insufficient data to determine primary emotion",
    purchaseTrigger: "UNKNOWN — insufficient data to determine purchase trigger",
    coreObjections: ["UNKNOWN — insufficient data to determine objections"],
    awarenessLevel: "problem-aware",
    identityMotivation: "UNKNOWN — insufficient data to determine identity motivation",
    deepestFear: "UNKNOWN — insufficient data to determine deepest fear",
    confidence: 0.20,
  };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Runs the Audience Intelligence Engine.
 *
 * Analyzes business intelligence to determine who buys
 * this product, why they buy it, what stops them, and
 * what identity transformation they are seeking.
 *
 * Separates demographics (who) from psychographics (why).
 *
 * This module makes NO marketing strategy decisions.
 * It only understands the audience.
 *
 * All output is JSON-serializable for future memory caching.
 *
 * @param business - Output of Business Intelligence Engine
 * @returns AudienceIntelligenceObject
 */
export function analyzeAudienceIntelligence(
  business: IntelligenceModuleResult<BusinessIntelligenceObject>
): IntelligenceModuleResult<AudienceIntelligenceObject> {
  const businessFindings = business.findings;
  const signals = detectAudienceSignals(businessFindings);

  // Resolve base profile from category
  const baseProfile =
    CATEGORY_AUDIENCE_PROFILES[businessFindings.resolvedCategory] ??
    buildUnknownProfile();

  // Apply signal modifiers
  const profile = applySignalModifiers(baseProfile, signals, businessFindings);

  const findings: AudienceIntelligenceObject = {
    _module: "AudienceIntelligence",
    primaryPersona: profile.primaryPersona,
    primaryEmotion: profile.primaryEmotion,
    purchaseTrigger: profile.purchaseTrigger,
    coreObjections: profile.coreObjections,
    awarenessLevel: profile.awarenessLevel,
    identityMotivation: profile.identityMotivation,
    deepestFear: profile.deepestFear,
  };

  const usedUnknownProfile = profile.primaryPersona.startsWith("UNKNOWN");
  const unknowns: string[] = [];
  if (usedUnknownProfile) {
    unknowns.push("Category could not be resolved - fallback unknown profile used");
  }

  const status: ModuleStatus = usedUnknownProfile ? "unknown" : "complete";

  return {
    module: "AudienceIntelligence",
    status,
    confidence: profile.confidence,
    evidence: signals.map((s) => s.evidence),
    unknowns,
    recommendationsForNext: [
      "Purchase trigger: " + profile.purchaseTrigger,
      "Identity motivation: " + profile.identityMotivation,
    ],
    findings,
  };
}