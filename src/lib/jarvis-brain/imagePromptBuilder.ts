/**
 * JARVIS Brain - Module 15: Image Prompt Builder
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - BUILDER LAYER TRANSLATION MODULE
 *
 * ARCHITECTURAL NOTE:
 * This is a Translation Module. It does not think, strategize, or
 * make marketing decisions. It translates an already-completed
 * ImageCreativeBrief into a provider-neutral ImagePromptObject.
 *
 * ARCHITECTURE: CreativeStrategyObject (strategic) flows through
 * Creative Asset Builder into ImageCreativeBrief (execution
 * artifact) before ever reaching this module. Image Prompt Builder
 * consumes ONLY ImageCreativeBrief - never CreativeStrategyObject
 * directly - so that strategic interpretation and execution
 * translation remain separate responsibilities.
 *
 * PERMANENT BOUNDARY: The image provider must NEVER receive
 * Business Intelligence, Audience Intelligence, Competitor
 * Intelligence, Offer Intelligence, Positioning, Messaging,
 * Campaign Architecture, Campaign Intelligence, or any raw Brain
 * reasoning - including CreativeStrategyObject itself. The provider
 * receives ONLY the ImagePromptObject produced here, built from
 * nothing but ImageCreativeBrief. This module does not import or
 * reference any of those upstream types - the boundary is enforced
 * structurally by this file's own import list.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI calls. No image provider SDKs.
 * - No database access.
 * - No external services. No HTTP.
 * - No randomness.
 * - Never invent new creative direction, never reinterpret Brain
 *   decisions - preserve visual direction, mood, composition,
 *   style, required elements, constraints, and brand requirements
 *   exactly as given.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 * - Module identity is expressed only through the outer wrapper's
 *   `module` field - findings objects do not duplicate it with `_module`.
 *
 * DEPENDENCY: types.ts only. Consumes only ImageCreativeBrief (bare,
 * as it is never itself wrapped in IntelligenceModuleResult<T>) and
 * the public contract of Decision Engine's result, for authorization
 * only.
 */

import type {
  ImageCreativeBrief,
  DecisionRecord,
  ImagePromptObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function buildPrompt(brief: ImageCreativeBrief): string {
  const parts: string[] = [];

  parts.push("Subject: " + brief.subject + ", " + brief.subjectAction + ".");
  parts.push("Background: " + brief.background + ".");
  parts.push("Lighting: " + brief.lighting + ".");
  parts.push("Composition: " + brief.composition + ".");
  parts.push("Negative space: " + brief.negativeSpace + ".");
  parts.push("Visual style: " + brief.visualStyle + ".");
  parts.push("Mood: " + brief.mood.join(", ") + ".");
  parts.push("Emotional tone: " + brief.emotion + ".");

  const validBrandColors = brief.brandColors.filter((c) => !c.startsWith("UNKNOWN"));
  if (validBrandColors.length > 0) {
    parts.push("Brand colors to incorporate: " + validBrandColors.join(", ") + ".");
  }

  return parts.join(" ");
}

function buildNegativePrompt(brief: ImageCreativeBrief): string {
  const exclusions: string[] = [
    "watermark",
    "text overlay",
    "logos other than specified brand colors",
    "blurry or low-quality rendering",
  ];

  const negativeSpaceLower = brief.negativeSpace.toLowerCase();
  if (negativeSpaceLower.includes("generous")) {
    exclusions.push("cluttered composition", "cramped framing");
  } else if (negativeSpaceLower.includes("minimal")) {
    exclusions.push("excessive empty space", "sparse composition");
  }

  return exclusions.join(", ");
}

function determineQuality(brief: ImageCreativeBrief): "standard" | "high" {
  const styleLower = brief.visualStyle.toLowerCase();
  if (styleLower.includes("high-production") || styleLower.includes("polished")) {
    return "high";
  }
  return "standard";
}

function determineStyle(
  brief: ImageCreativeBrief
): "photographic" | "illustration" | "digital-art" {
  const styleLower = brief.visualStyle.toLowerCase();
  if (styleLower.includes("illustration")) return "illustration";
  if (styleLower.includes("digital art") || styleLower.includes("digital-art")) return "digital-art";
  return "photographic";
}

function checkBuildAuthorized(decisionRecord: DecisionRecord): boolean {
  return decisionRecord.decisionLog.some(
    (entry) => entry.decision === "Package routing: proceed to Prompt Builder"
  );
}

// ============================================================
// PUBLIC API
// ============================================================

export function buildImagePrompt(
  imageCreativeBrief: ImageCreativeBrief,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ImagePromptObject> {
  const decisionData = decisionRecord.findings;

  const prompt = buildPrompt(imageCreativeBrief);
  const negativePrompt = buildNegativePrompt(imageCreativeBrief);
  const quality = determineQuality(imageCreativeBrief);
  const style = determineStyle(imageCreativeBrief);
  const buildAuthorized = checkBuildAuthorized(decisionData);

  const findings: ImagePromptObject = {
    prompt,
    negativePrompt,
    aspectRatio: imageCreativeBrief.aspectRatio,
    quality,
    style,
  };

  const unknowns: string[] = [];
  if (!buildAuthorized) {
    unknowns.push(
      "Decision Engine did not authorize proceeding to a Builder module for this variation - the image prompt was still built deterministically, but should not be sent to a provider until routing is resolved"
    );
  }
  if (imageCreativeBrief.emotion.startsWith("UNKNOWN")) {
    unknowns.push("Emotional tone could not be determined for this variation");
  }
  if (imageCreativeBrief.visualStyle.startsWith("UNKNOWN")) {
    unknowns.push("Visual style could not be determined for this variation");
  }
  if (imageCreativeBrief.brandColors.length === 1 && imageCreativeBrief.brandColors[0].startsWith("UNKNOWN")) {
    unknowns.push("Brand colors were not provided upstream - prompt does not specify brand color requirements");
  }

  const evidence: string[] = [
    "Positive prompt built from subject, action, background, lighting, composition, visual style, mood, and emotion (ImageCreativeBrief)",
    "Negative prompt built from negative space guidance plus standard image-generation technical exclusions",
    "Quality tier derived from visual style keyword matching (high-production/polished -> high, else standard)",
    "Style category defaults to photographic, matching how all upstream briefs are written (product-in-use subjects, lighting, background)",
    "Aspect ratio reused directly from ImageCreativeBrief - no invention",
    "Build authorization cross-checked against Decision Engine's package routing decision",
    "No content beyond ImageCreativeBrief and Decision Engine's routing status was consumed - no raw Brain objects, including CreativeStrategyObject, were referenced",
  ];

  const hasCritical = !buildAuthorized;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(0.2, Math.min(decisionRecord.confidence - unknownPenalty, 1.0));

  return {
    module: "ImagePromptBuilder",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      buildAuthorized
        ? "Proceed to image provider call with this ImagePromptObject"
        : "Hold - resolve Decision Engine's package routing before calling an image provider",
      "Style: " + style + ", Quality: " + quality,
    ],
    findings,
  };
}