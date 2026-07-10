/**
 * JARVIS Brain - Module 16: Creative Asset Builder
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - BUILDER LAYER
 *
 * ARCHITECTURAL NOTE:
 * This is a Builder Layer module. It prepares creative execution
 * specifications - it does not generate prompts, images, videos, or
 * copy. It is the enrichment stage between CreativeStrategyObject
 * (strategic) and the final ImageCreativeBrief (execution artifact)
 * that Image Prompt Builder consumes. Variation Engine already
 * produces a baseline ImageCreativeBrief per variation; this module
 * takes that baseline and applies the full creative strategy
 * context to refine it into the production-ready brief.
 *
 * ARCHITECTURE:
 * CreativeStrategyObject -> Creative Asset Builder -> ImageCreativeBrief
 * -> Image Prompt Builder -> ImagePromptObject -> Image Provider Adapter
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI providers.
 * - No database access.
 * - No external services. No HTTP.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Does not generate prompts, images, videos, copy, headlines, or
 *   hooks - those belong to Image Prompt Builder or Prompt Builder.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 * - Module identity is expressed only through the outer wrapper's
 *   `module` field - findings objects do not duplicate it with `_module`.
 *
 * DEPENDENCY: types.ts only. Consumes only the public contracts of
 * Creative Strategy, Variation Engine's execution package, and
 * Decision Engine's result.
 */

import type {
  CreativeStrategyObject,
  VariationStrategyPackage,
  DecisionRecord,
  ImageCreativeBrief,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineCameraAngleGuidance(assetType: string): string {
  if (assetType.toLowerCase().includes("video")) {
    return "eye-level tracking or slow push-in camera movement";
  }
  return "eye-level, straight-on product framing";
}

function determinePlatformDimensions(aspectRatio: string): string {
  if (aspectRatio === "9:16") return "minimum 1080x1920px";
  if (aspectRatio === "1:1") return "minimum 1080x1080px";
  return "minimum 1200x628px";
}

function determineSafeAreas(): string {
  return "Keep the key subject and any text within the center 80% of the frame; avoid placing critical elements in the outer 10% margin to prevent platform UI overlap";
}

function determineTextOverlayGuidance(): string {
  return "Reserve either the top or bottom 20% of the frame for potential text overlay; ensure sufficient background contrast in that zone";
}

function determineRequiredElements(brief: ImageCreativeBrief): string[] {
  const required: string[] = ["Subject clearly visible: " + brief.subject];

  const validBrandColors = brief.brandColors.filter((c) => !c.startsWith("UNKNOWN"));
  if (validBrandColors.length > 0) {
    required.push("Brand colors present: " + validBrandColors.join(", "));
  } else {
    required.push("UNKNOWN - brand colors not specified upstream, cannot require them");
  }

  return required;
}

function determineForbiddenElements(brief: ImageCreativeBrief): string[] {
  const forbidden: string[] = ["Competitor branding or logos", "Watermarks or stock photo overlays"];

  const validBrandColors = brief.brandColors.filter((c) => !c.startsWith("UNKNOWN"));
  if (validBrandColors.length > 0) {
    forbidden.push("Colors outside the specified brand palette");
  }

  return forbidden;
}

function checkBuildAuthorized(decisionRecord: DecisionRecord): boolean {
  return decisionRecord.decisionLog.some(
    (entry) => entry.decision === "Package routing: proceed to Prompt Builder"
  );
}

// ============================================================
// PUBLIC API
// ============================================================

export function buildCreativeAsset(
  creativeStrategy: IntelligenceModuleResult<CreativeStrategyObject>,
  variationPackage: IntelligenceModuleResult<VariationStrategyPackage>,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ImageCreativeBrief> {
  const creativeData = creativeStrategy.findings;
  const variationData = variationPackage.findings;
  const decisionData = decisionRecord.findings;

  const baselineBrief = variationData.imageCreativeBrief;
  const buildAuthorized = checkBuildAuthorized(decisionData);

  const assetType = creativeData.formatRecommendations.assetType ?? "";
  const cameraAngleGuidance = determineCameraAngleGuidance(assetType);

  const enrichedComposition =
    baselineBrief.composition.startsWith("UNKNOWN")
      ? baselineBrief.composition
      : baselineBrief.composition + ". Camera angle: " + cameraAngleGuidance;

  const enrichedVisualStyle =
    baselineBrief.visualStyle.startsWith("UNKNOWN") || creativeData.creativeAngle.startsWith("UNKNOWN")
      ? baselineBrief.visualStyle
      : baselineBrief.visualStyle + ". Creative angle: " + creativeData.creativeAngle;

  const findings: ImageCreativeBrief = {
    variationId: baselineBrief.variationId,
    emotion: baselineBrief.emotion,
    visualStyle: enrichedVisualStyle,
    subject: baselineBrief.subject,
    subjectAction: baselineBrief.subjectAction,
    background: baselineBrief.background,
    lighting: baselineBrief.lighting,
    composition: enrichedComposition,
    negativeSpace: baselineBrief.negativeSpace,
    brandColors: baselineBrief.brandColors,
    platform: baselineBrief.platform,
    aspectRatio: baselineBrief.aspectRatio,
    mood: baselineBrief.mood,
  };

  const requiredElements = determineRequiredElements(baselineBrief);
  const forbiddenElements = determineForbiddenElements(baselineBrief);
  const platformDimensions = determinePlatformDimensions(baselineBrief.aspectRatio);
  const safeAreas = determineSafeAreas();
  const textOverlayGuidance = determineTextOverlayGuidance();

  const unknowns: string[] = [];
  if (!buildAuthorized) {
    unknowns.push(
      "Decision Engine did not authorize proceeding to a Builder module for this variation - the brief was still enriched deterministically, but should not proceed to Image Prompt Builder until routing is resolved"
    );
  }
  if (baselineBrief.emotion.startsWith("UNKNOWN")) {
    unknowns.push("Baseline emotion could not be determined for this variation");
  }
  if (baselineBrief.visualStyle.startsWith("UNKNOWN")) {
    unknowns.push("Baseline visual style could not be determined for this variation");
  }
  if (requiredElements.some((r) => r.startsWith("UNKNOWN"))) {
    unknowns.push("Brand colors were not available to require in the final brief");
  }

  const evidence: string[] = [
    "Baseline brief taken directly from Variation Engine's execution package for variation: " + baselineBrief.variationId,
    "Composition enriched with camera angle guidance, derived from Creative Strategy's asset type recommendation: " + assetType,
    "Visual style enriched with Creative Strategy's creative angle",
    "Required elements derived from subject and brand colors already present in the baseline brief",
    "Forbidden elements, platform dimensions, safe areas, and text overlay guidance are standard production conventions - not upstream-derived business facts",
    "Build authorization cross-checked against Decision Engine's package routing decision",
  ];

  const hasCritical = !buildAuthorized;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min((creativeStrategy.confidence + variationPackage.confidence) / 2 - unknownPenalty, 1.0)
  );

  return {
    module: "CreativeAssetBuilder",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Required elements: " + requiredElements.join("; "),
      "Forbidden elements: " + forbiddenElements.join("; "),
      "Platform dimensions: " + platformDimensions,
      "Safe areas: " + safeAreas,
      "Text overlay guidance: " + textOverlayGuidance,
      buildAuthorized
        ? "Proceed to Image Prompt Builder with this ImageCreativeBrief"
        : "Hold - resolve Decision Engine's package routing before proceeding to Image Prompt Builder",
    ],
    findings,
  };
}