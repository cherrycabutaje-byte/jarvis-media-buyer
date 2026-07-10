/**
 * JARVIS Brain - Module 12: Package Definition Engine
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - BUILDER LAYER
 *
 * ARCHITECTURAL NOTE:
 * This is a Builder Layer module. It does not generate content,
 * prompts, or assets. It defines what constitutes a COMPLETE
 * Marketing Product: completion criteria, validation rules, and
 * package integrity rules. It answers "when is this Marketing
 * Product complete?" - it never changes any Brain decision.
 *
 * TYPE NOTE: PackageDefinitionObject.externalToolsRequired is typed
 * as the empty tuple `[]` in the frozen types.ts - not `string[]`.
 * This means the field can only ever be assigned an empty array.
 * It is always set to [] here, matching the frozen contract exactly.
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
 * DEPENDENCY: types.ts only. Consumes only the public contract of
 * Product Structure Engine's result.
 */

import type {
  ProductStructureObject,
  PackageDefinitionObject,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function buildRequiredComponents(structure: ProductStructureObject): string[] {
  const required: string[] = [];

  for (const component of structure.textComponents) {
    required.push(
      component + " x" + structure.variationCount + " (mandatory text asset, one per variation)"
    );
  }
  for (const component of structure.imageComponents) {
    required.push(
      component + " x" + structure.variationCount + " (mandatory image asset, one per variation)"
    );
  }
  for (const component of structure.videoComponents) {
    required.push(
      component + " x" + structure.variationCount + " (mandatory video asset, one per variation)"
    );
  }
  for (const shared of structure.sharedComponents) {
    required.push(shared + " (mandatory shared component, produced once)");
  }

  return required;
}

function buildIncludedDocuments(structure: ProductStructureObject): string[] {
  const documents: string[] = ["Validation checklist", "Package completeness report"];

  if (structure.sharedComponents.some((c) => c.toLowerCase().includes("creative brief"))) {
    documents.push("Creative brief reference");
  }

  return documents;
}

function determineProductionReadiness(
  productStructureResult: IntelligenceModuleResult<ProductStructureObject>
): boolean {
  return productStructureResult.status === "complete";
}

// ============================================================
// PUBLIC API
// ============================================================

export function definePackage(
  productStructure: IntelligenceModuleResult<ProductStructureObject>
): IntelligenceModuleResult<PackageDefinitionObject> {
  const structureData = productStructure.findings;

  const requiredComponents = buildRequiredComponents(structureData);
  const includedDocuments = buildIncludedDocuments(structureData);
  const isProductionReady = determineProductionReadiness(productStructure);

  const findings: PackageDefinitionObject = {
    requiredComponents,
    downloadFormats: structureData.outputFormats,
    includedDocuments,
    isProductionReady,
    externalToolsRequired: [],
  };

  const unknowns: string[] = [];
  if (!isProductionReady) {
    unknowns.push(
      "Package is not yet production ready: Product Structure Engine reported status '" +
      productStructure.status + "' rather than 'complete'"
    );
    for (const upstreamUnknown of productStructure.unknowns) {
      unknowns.push("Inherited from Product Structure Engine: " + upstreamUnknown);
    }
  }
  if (requiredComponents.length === 0) {
    unknowns.push("No required components were defined by Product Structure Engine");
  }

  const totalComponentTypes =
    structureData.textComponents.length +
    structureData.imageComponents.length +
    structureData.videoComponents.length;

  const evidence: string[] = [
    "Required components derived from Product Structure Engine's text, image, and video component lists, multiplied by variation count: " + structureData.variationCount,
    "Shared components carried forward as mandatory, produced once rather than per variation",
    "Download formats reused directly from Product Structure Engine's output formats",
    "Production readiness derived from Product Structure Engine's own status: '" + productStructure.status + "'",
    "externalToolsRequired is fixed to an empty array - the frozen type constrains this field to the empty tuple []",
  ];

  const hasCritical = requiredComponents.length === 0;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.03, 0.2);
  const confidence = Math.max(
    0.2,
    Math.min(productStructure.confidence - unknownPenalty, 1.0)
  );

  return {
    module: "PackageDefinition",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      "Completion rule: package is complete only when every required component listed has a corresponding produced asset",
      "Package integrity rule: every variation must share the same product type and reuse the same shared components (tone of voice, guardrails)",
      "Required validation: confirm produced asset count per component matches variationCount x " + totalComponentTypes + " component categories",
      "Required dependency: text assets must be finalized before image or video briefs, per Product Structure Engine's builder sequence",
      "Validation checklist: [ ] component count match, [ ] shared components present for every variation, [ ] output formats match downloadFormats, [ ] production readiness flag confirmed",
    ],
    findings,
  };
}