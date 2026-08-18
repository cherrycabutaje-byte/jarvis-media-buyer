import { buildStaticCreativeSpec } from "@/lib/production/staticCreativeProducer"
import type { HybridDecisionResult } from "@/lib/hybrid/hybridCreativeDecisionEngine"

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  PASS: ${label}`)
  } else {
    failed++
    console.log(`  FAIL: ${label}`)
  }
}

function makeDecision(overrides: Partial<HybridDecisionResult>): HybridDecisionResult {
  return {
    decision: "REUSE",
    reason: "Test reason",
    selectedAssetIds: ["asset-1"],
    missingComponents: [],
    recommendedOperations: [],
    confidence: 0.9,
    evidence: ["Test evidence"],
    relativeCost: "VERY_LOW",
    estimatedGenerationRequirement: "None",
    ...overrides,
  }
}

console.log("=== CASE A: REUSE with existing copy ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "REUSE" }),
    creativeAngle: "Test angle",
    existingAdCopy: "Discover the best product ever made. Shop now and save.",
    productImageAssetId: "asset-1",
    logoAssetId: null,
  })
  assert(spec.supported === true, "supported is true")
  assert(spec.productionMethod === "REUSE", `productionMethod is REUSE (got ${spec.productionMethod})`)
  assert(spec.headline === "Discover the best product ever made.", `headline extracted correctly (got "${spec.headline}")`)
  assert(spec.cta === "Shop now and save.", `cta extracted correctly (got "${spec.cta}")`)
  assert(spec.costEvidence.generationCalls === 0, "generationCalls is 0")
  assert(spec.costEvidence.imageGenerationCalls === 0, "imageGenerationCalls is 0")
  assert(spec.costEvidence.videoGenerationCalls === 0, "videoGenerationCalls is 0")
}

console.log("\n=== CASE B: REDESIGN ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "REDESIGN" }),
    creativeAngle: "Test angle",
    existingAdCopy: "Great product for everyone.",
    productImageAssetId: "asset-1",
    logoAssetId: null,
  })
  assert(spec.supported === true, "supported is true")
  assert(spec.productionMethod === "REDESIGN", `productionMethod is REDESIGN (got ${spec.productionMethod})`)
  assert(spec.layoutTemplate === "product-hero", "layout template assigned")
}

console.log("\n=== CASE C: REMIX ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "REMIX", selectedAssetIds: ["asset-1", "asset-2"] }),
    creativeAngle: "Test angle",
    existingAdCopy: "Great product.",
    productImageAssetId: "asset-1",
    logoAssetId: "asset-2",
  })
  assert(spec.supported === true, "supported is true")
  assert(spec.productionMethod === "REMIX", `productionMethod is REMIX (got ${spec.productionMethod})`)
  assert(spec.logoAssetId === "asset-2", "logo asset id preserved")
}

console.log("\n=== CASE D: PARTIAL_GENERATION -> truthful unsupported result ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "PARTIAL_GENERATION", missingComponents: ["Product video"] }),
    creativeAngle: "Test angle",
    existingAdCopy: "Great product.",
    productImageAssetId: null,
    logoAssetId: null,
  })
  assert(spec.supported === false, "supported is false")
  assert(spec.productionMethod === "PARTIAL_GENERATION", `productionMethod is PARTIAL_GENERATION (got ${spec.productionMethod})`)
  assert(spec.reason.includes("generation"), "reason truthfully mentions generation requirement")
  assert(spec.costEvidence.generationCalls === 0, "no generation call made")
}

console.log("\n=== CASE E: FULL_GENERATION -> truthful unsupported result ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "FULL_GENERATION", missingComponents: ["Product image"] }),
    creativeAngle: "Test angle",
    existingAdCopy: null,
    productImageAssetId: null,
    logoAssetId: null,
  })
  assert(spec.supported === false, "supported is false")
  assert(spec.productionMethod === "FULL_GENERATION", `productionMethod is FULL_GENERATION (got ${spec.productionMethod})`)
  assert(spec.costEvidence.generationCalls === 0, "no generation call made")
}

console.log("\n=== CASE J: No existing copy -> no fabricated claim ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "REUSE" }),
    creativeAngle: "Test angle",
    existingAdCopy: null,
    productImageAssetId: "asset-1",
    logoAssetId: null,
  })
  assert(spec.headline === null, "headline is honestly null, not fabricated")
  assert(spec.cta === null, "cta is honestly null, not fabricated")
  assert(spec.missingComponents.includes("Ad copy (headline/CTA)"), "missing copy honestly reported")
}

console.log("\n=== CASE K: Lineage preserved ===")
{
  const spec = buildStaticCreativeSpec({
    hybridDecision: makeDecision({ decision: "REUSE", selectedAssetIds: ["asset-99"], evidence: ["Specific evidence line"] }),
    creativeAngle: "Specific angle",
    existingAdCopy: "Copy text here.",
    productImageAssetId: "asset-99",
    logoAssetId: null,
  })
  assert(spec.lineage.sourceCreativeAssetIds.includes("asset-99"), "source asset id preserved in lineage")
  assert(spec.lineage.hybridDecision === "REUSE", "hybrid decision preserved in lineage")
  assert(spec.lineage.creativeAngle === "Specific angle", "creative angle preserved in lineage")
  assert(spec.lineage.hybridDecisionEvidence.includes("Specific evidence line"), "hybrid evidence preserved in lineage")
}

console.log("\n=== CASE L: REUSE/REDESIGN/REMIX all report generationCalls = 0 ===")
{
  for (const decision of ["REUSE", "REDESIGN", "REMIX"] as const) {
    const spec = buildStaticCreativeSpec({
      hybridDecision: makeDecision({ decision, selectedAssetIds: decision === "REMIX" ? ["asset-1", "asset-2"] : ["asset-1"] }),
      creativeAngle: "Test angle",
      existingAdCopy: "Copy.",
      productImageAssetId: "asset-1",
      logoAssetId: decision === "REMIX" ? "asset-2" : null,
    })
    assert(spec.costEvidence.generationCalls === 0, `${decision}: generationCalls = 0`)
    assert(spec.costEvidence.imageGenerationCalls === 0, `${decision}: imageGenerationCalls = 0`)
    assert(spec.costEvidence.videoGenerationCalls === 0, `${decision}: videoGenerationCalls = 0`)
  }
}

console.log("\n=== NOTE: Cases F/G (cross-product/cross-workspace exclusion) are structurally ===")
console.log("=== guaranteed upstream by the Hybrid Decision Engine (already tested there) - ===")
console.log("=== by the time a HybridDecisionResult reaches this module, only correctly-scoped ===")
console.log("=== asset IDs can appear in selectedAssetIds. Not re-tested here to avoid duplication. ===")

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  process.exit(1)
}