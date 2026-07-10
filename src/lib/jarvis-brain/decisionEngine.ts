/**
 * JARVIS Brain - Module 13: Decision Engine
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - BUILDER LAYER COORDINATION MODULE
 *
 * ARCHITECTURAL NOTE:
 * This is a Builder Layer coordination module. It is NOT part of
 * the JARVIS Brain's strategic decision-making - all strategic
 * decisions were already made by Positioning Engine, Messaging
 * Strategy, Creative Strategy, Campaign Architecture, and Campaign
 * Intelligence. This module creates no new marketing strategy. Its
 * responsibility is to coordinate execution: which variation to
 * build, whether the package is ready, which Builder modules should
 * run, and in what order.
 *
 * SCOPE NOTE: primaryObjectionToAddress cannot be derived from this
 * module's permitted inputs (ProductStructure, PackageDefinition,
 * CampaignIntelligence, VariationEngine). Objection data lives in
 * Audience Intelligence and Messaging Strategy, which are out of
 * scope for Decision Engine. It is marked UNKNOWN with an explicit
 * reason rather than approximated from unrelated fields such as
 * messaging guardrails.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls.
 * - No database access.
 * - No external services.
 * - No randomness.
 * - Never invent information not derivable from upstream findings.
 * - Never overrides any Brain output - coordinates only.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 * - Module identity is expressed only through the outer wrapper's
 *   `module` field - findings objects do not duplicate it with `_module`.
 *
 * DEPENDENCY: types.ts only. Consumes only the public contracts of
 * Product Structure Engine, Package Definition Engine, Campaign
 * Intelligence Engine, and Variation Engine.
 */

import type {
  ProductStructureObject,
  PackageDefinitionObject,
  CampaignIntelligenceObject,
  VariationStrategyPackage,
  DecisionRecord,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function determineAssetPriority(structure: ProductStructureObject): string[] {
  const priority: string[] = [];
  if (structure.textComponents.length > 0) priority.push("text assets");
  if (structure.imageComponents.length > 0) priority.push("image assets");
  if (structure.videoComponents.length > 0) priority.push("video assets");
  priority.push("final assembly");
  return priority;
}

function determineBuilderModulesToRun(structure: ProductStructureObject): string[] {
  const modules: string[] = [];
  if (structure.providersRequired.includes("text")) {
    modules.push("promptBuilder.ts");
  }
  if (structure.providersRequired.includes("image")) {
    modules.push("imagePromptBuilder.ts");
  }
  if (structure.providersRequired.includes("video")) {
    modules.push("(video prompt builder - not yet built)");
  }
  modules.push("creativeAssetBuilder.ts");
  return modules;
}

function findLeadAngle(
  recommendedVariationId: string,
  variations: IntelligenceModuleResult<VariationStrategyPackage>[]
): string {
  const match = variations.find((v) => v.findings.variationId === recommendedVariationId);
  if (!match) {
    return "UNKNOWN - recommended variation id not found among prepared execution packages";
  }
  return match.findings.textStrategyBrief.angle;
}

// ============================================================
// PUBLIC API
// ============================================================

export function coordinateBuildDecision(
  productStructure: IntelligenceModuleResult<ProductStructureObject>,
  packageDefinition: IntelligenceModuleResult<PackageDefinitionObject>,
  campaignIntelligence: IntelligenceModuleResult<CampaignIntelligenceObject>,
  variations: IntelligenceModuleResult<VariationStrategyPackage>[]
): IntelligenceModuleResult<DecisionRecord> {
  const structureData = productStructure.findings;
  const packageData = packageDefinition.findings;
  const campaignIntelligenceData = campaignIntelligence.findings;

  const assetPriority = determineAssetPriority(structureData);
  const builderModulesToRun = determineBuilderModulesToRun(structureData);
  const leadAngle = findLeadAngle(campaignIntelligenceData.recommendedVariation, variations);
  const primaryObjectionToAddress =
    "UNKNOWN - objection data is out of scope for Decision Engine (available only via Audience Intelligence and Messaging Strategy, which this module does not consume)";

  const buildReady = packageData.isProductionReady;

  const decisionLog: DecisionRecord["decisionLog"] = [
    {
      decision: "Execute variation: " + campaignIntelligenceData.recommendedVariation,
      reason: "Highest-confidence variation per Campaign Intelligence ranking",
      module: "CampaignIntelligence",
    },
    {
      decision: "Build readiness: " + (buildReady ? "ready" : "not ready"),
      reason: "Derived from Package Definition Engine's isProductionReady flag",
      module: "PackageDefinition",
    },
    {
      decision: "Builder modules to run: " + builderModulesToRun.join(", "),
      reason: "Derived from Product Structure Engine's providersRequired list",
      module: "ProductStructure",
    },
    {
      decision: "Execution order: " + assetPriority.join(" -> "),
      reason: "Follows Product Structure Engine's builder sequence recommendation (text before image/video, assembly last)",
      module: "ProductStructure",
    },
    {
      decision: buildReady
        ? "Package routing: proceed to Prompt Builder"
        : "Package routing: hold - package not yet production ready",
      reason: buildReady
        ? "All required components are resolved per Package Definition Engine"
        : "Package Definition Engine reports the package is not production ready",
      module: "DecisionEngine",
    },
  ];

  const findings: DecisionRecord = {
    assetPriority,
    leadAngle,
    primaryObjectionToAddress,
    decisionLog,
  };

  const unknowns: string[] = [
    "primaryObjectionToAddress could not be determined - out of scope for this module's permitted inputs",
  ];
  if (leadAngle.startsWith("UNKNOWN")) {
    unknowns.push("Lead angle could not be determined - recommended variation not found among prepared execution packages");
  }
  if (!buildReady) {
    unknowns.push("Package is not production ready per Package Definition Engine");
    for (const upstreamUnknown of packageDefinition.unknowns) {
      unknowns.push("Inherited from Package Definition Engine: " + upstreamUnknown);
    }
  }

  const evidence: string[] = [
    "Asset priority and builder module sequence derived from Product Structure Engine's required components and providers",
    "Recommended variation and lead angle derived from Campaign Intelligence's ranking, cross-referenced against Variation Engine's prepared execution packages",
    "Build readiness derived directly from Package Definition Engine's isProductionReady flag",
    "No new marketing strategy was created - all referenced values are pass-throughs of already-decided Brain outputs",
  ];

  const hasCritical = leadAngle.startsWith("UNKNOWN") && !buildReady;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(
      (productStructure.confidence + packageDefinition.confidence + campaignIntelligence.confidence) / 3 -
        unknownPenalty,
      1.0
    )
  );

  return {
    module: "DecisionEngine",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Next Builder module: " + builderModulesToRun[0],
      "Lead angle to carry forward: " + leadAngle,
      buildReady
        ? "Proceed with production"
        : "Resolve package readiness gaps before proceeding to Prompt Builder",
    ],
    findings,
  };
}