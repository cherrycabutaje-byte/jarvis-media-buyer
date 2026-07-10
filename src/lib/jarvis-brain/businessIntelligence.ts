/**
 * JARVIS Brain - Module 1: Business Intelligence Engine
 * Architecture V4.3 Engineering Baseline
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Unknown values are marked explicitly.
 * - Does NOT make marketing strategy decisions.
 * - Only understands the business.
 *
 * DEPENDENCY: imports from types.ts only.
 */

import type {
  BusinessInput,
  BusinessIntelligenceObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Resolves the product category from available signals.
 * Returns UNKNOWN if category cannot be determined.
 */
function resolveCategory(input: BusinessInput): string {
  if (input.category && input.category.trim().length > 0) {
    return input.category.trim();
  }

  const description = (input.productDescription + " " + input.productName).toLowerCase();

  const categorySignals: Array<{ keywords: string[]; category: string }> = [
    { keywords: ["supplement", "vitamin", "protein", "weight loss", "diet", "fitness", "workout", "gym"], category: "Health & Fitness" },
    { keywords: ["dog", "cat", "pet", "animal", "paw", "puppy", "kitten"], category: "Pet Products" },
    { keywords: ["course", "coaching", "training", "masterclass", "program", "bootcamp", "mentorship"], category: "Education & Coaching" },
    { keywords: ["software", "app", "saas", "platform", "tool", "dashboard", "subscription"], category: "Software & SaaS" },
    { keywords: ["skincare", "beauty", "makeup", "cosmetic", "serum", "moisturizer"], category: "Beauty & Skincare" },
    { keywords: ["clothing", "fashion", "apparel", "dress", "shirt", "shoes", "wear"], category: "Fashion & Apparel" },
    { keywords: ["food", "snack", "meal", "drink", "beverage", "nutrition", "recipe"], category: "Food & Beverage" },
    { keywords: ["home", "furniture", "decor", "kitchen", "bedroom", "living room"], category: "Home & Living" },
    { keywords: ["marketing", "advertising", "sales", "copywriting", "funnel", "leads"], category: "Marketing & Sales" },
    { keywords: ["finance", "investing", "trading", "money", "income", "passive"], category: "Finance & Investing" },
  ];

  for (const signal of categorySignals) {
    if (signal.keywords.some((kw) => description.includes(kw))) {
      return signal.category;
    }
  }

  return "UNKNOWN";
}

/**
 * Scores offer strength based on available signals (1-10).
 * Higher score = more compelling offer.
 */
function scoreOfferStrength(input: BusinessInput): number {
  let score = 3;

  // Has a clear price point (+1)
  if (input.price && input.price.trim().length > 0) score += 1;

  // Has multiple features listed (+1)
  if (input.keyFeatures && input.keyFeatures.length >= 3) score += 1;

  // Has existing copy to analyze (+1)
  if (input.existingCopy?.headline || input.existingCopy?.body) score += 1;

  // Has a URL (real product) (+1)
  if (input.url && input.url.trim().length > 0) score += 1;

  // Description is detailed (over 100 chars) (+1)
  if (input.productDescription.length > 100) score += 1;

  // Category is resolved (+1)
  if (input.category && input.category.trim().length > 0) score += 1;

  return Math.min(score, 10);
}

/**
 * Determines price positioning from price string.
 * Returns best-effort inference or mid-market if unknown.
 */
function determinePricePositioning(
  price: string | undefined,
  category: string
): BusinessIntelligenceObject["pricePositioning"] {
  if (!price || price.trim().length === 0) {
    return "mid-market";
  }

  // Extract numeric value from price string
  const numericMatch = price.replace(/,/g, "").match(/[\d.]+/);
  if (!numericMatch) return "mid-market";

  const numericPrice = parseFloat(numericMatch[0]);
  if (isNaN(numericPrice)) return "mid-market";

  // Category-aware price positioning thresholds
  const thresholds: Record<string, { budget: number; midMarket: number; premium: number }> = {
    "Software & SaaS":       { budget: 19, midMarket: 79,  premium: 199  },
    "Education & Coaching":  { budget: 47, midMarket: 297, premium: 997  },
    "Health & Fitness":      { budget: 25, midMarket: 97,  premium: 297  },
    "Beauty & Skincare":     { budget: 20, midMarket: 60,  premium: 150  },
    "Pet Products":          { budget: 15, midMarket: 50,  premium: 120  },
    "Fashion & Apparel":     { budget: 30, midMarket: 100, premium: 300  },
    "Food & Beverage":       { budget: 10, midMarket: 35,  premium: 80   },
    "Finance & Investing":   { budget: 47, midMarket: 197, premium: 997  },
    "Marketing & Sales":     { budget: 29, midMarket: 97,  premium: 297  },
  };

  const t = thresholds[category] ?? { budget: 25, midMarket: 100, premium: 300 };

  if (numericPrice <= t.budget)     return "budget";
  if (numericPrice <= t.midMarket)  return "mid-market";
  if (numericPrice <= t.premium)    return "premium";
  return "value";
}

/**
 * Extracts key differentiators from available input.
 * Returns what makes this product different.
 */
function extractDifferentiators(input: BusinessInput): string[] {
  const differentiators: string[] = [];

  if (input.keyFeatures && input.keyFeatures.length > 0) {
    // Use provided features as differentiators
    differentiators.push(...input.keyFeatures.slice(0, 3));
  } else if (input.existingCopy?.body) {
    // Extract from copy if no features provided
    differentiators.push("Differentiators not explicitly provided — inferred from copy");
  } else {
    differentiators.push("UNKNOWN — insufficient data to determine differentiators");
  }

  return differentiators;
}

/**
 * Identifies primary weaknesses based on what is missing.
 */
function identifyWeaknesses(input: BusinessInput): string[] {
  const weaknesses: string[] = [];

  if (!input.price || input.price.trim().length === 0) {
    weaknesses.push("No price provided — offer strength cannot be fully assessed");
  }

  if (!input.url || input.url.trim().length === 0) {
    weaknesses.push("No URL provided — cannot verify real-world presence");
  }

  if (!input.keyFeatures || input.keyFeatures.length === 0) {
    weaknesses.push("No key features listed — differentiation is unclear");
  }

  if (!input.existingCopy?.headline && !input.existingCopy?.body) {
    weaknesses.push("No existing copy provided — cannot assess current messaging");
  }

  if (weaknesses.length === 0) {
    weaknesses.push("Sufficient data provided — no structural weaknesses detected");
  }

  return weaknesses;
}

/**
 * Derives core value proposition from input.
 * Uses product description as primary source.
 */
function deriveCoreValueProposition(input: BusinessInput): string {
  // If description is long enough, summarize intent
  if (input.productDescription.length > 50) {
    // Return the description as-is — no AI inference in this module
    // Positioning Engine will refine this into a true value proposition
    return input.productDescription.substring(0, 200).trim();
  }

  if (input.existingCopy?.headline) {
    return input.existingCopy.headline;
  }

  return "UNKNOWN — insufficient data to determine core value proposition";
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Runs the Business Intelligence Engine.
 *
 * Analyzes raw business input and returns structured
 * intelligence that downstream modules depend on.
 *
 * This module makes NO marketing strategy decisions.
 * It only understands the business.
 *
 * @param input - Raw business information
 * @returns BusinessIntelligenceObject
 */
export function analyzeBusinessIntelligence(
  input: BusinessInput
): IntelligenceModuleResult<BusinessIntelligenceObject> {
  const resolvedCategory = resolveCategory(input);
  const coreValueProposition = deriveCoreValueProposition(input);
  const offerStrengthScore = scoreOfferStrength(input);
  const keyDifferentiators = extractDifferentiators(input);
  const primaryWeaknesses = identifyWeaknesses(input);
  const pricePositioning = determinePricePositioning(input.price, resolvedCategory);

  const findings: BusinessIntelligenceObject = {
    _module: "BusinessIntelligence",
    coreValueProposition,
    offerStrengthScore,
    keyDifferentiators,
    primaryWeaknesses,
    pricePositioning,
    resolvedCategory,
  };

  const unknowns: string[] = [];
  if (resolvedCategory === "UNKNOWN") {
    unknowns.push("Category could not be resolved from available input");
  }
  if (coreValueProposition.startsWith("UNKNOWN")) {
    unknowns.push("Core value proposition could not be determined");
  }
  if (keyDifferentiators.some((d) => d.startsWith("UNKNOWN"))) {
    unknowns.push("Key differentiators could not be determined");
  }
  const hasStructuralWeaknesses = !(
    primaryWeaknesses.length === 1 &&
    primaryWeaknesses[0].startsWith("Sufficient data")
  );
  if (hasStructuralWeaknesses) {
    unknowns.push(...primaryWeaknesses);
  }

  const evidence: string[] = [
    "Category resolved as: " + resolvedCategory,
    "Offer strength score: " + offerStrengthScore + "/10",
    "Price positioning determined as: " + pricePositioning,
  ];

  const hasCritical =
    resolvedCategory === "UNKNOWN" && coreValueProposition.startsWith("UNKNOWN");
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";
  const confidence = hasCritical ? 0.2 : Math.max(0.3, offerStrengthScore / 10);

  return {
    module: "BusinessIntelligence",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Resolved category: " + resolvedCategory,
      "Price positioning: " + pricePositioning,
    ],
    findings,
  };
}