import { buildProductTruthProfile } from "@/lib/product/productTruth"

import { evaluateMasterEligibility } from "@/lib/product/masterProductAsset"
import { runCreativePreflight } from "@/lib/product/creativePreflight"
import type { HybridDecisionResult } from "@/lib/hybrid/hybridCreativeDecisionEngine"
import type { StaticCreativeSpec } from "@/lib/production/staticCreativeProducer"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function makeDecision(overrides: Partial<HybridDecisionResult>): HybridDecisionResult {
  return {
    decision: "REUSE", reason: "Test", selectedAssetIds: [], missingComponents: [],
    recommendedOperations: [], confidence: 0.9, evidence: ["Test evidence"],
    relativeCost: "VERY_LOW", estimatedGenerationRequirement: "None", ...overrides,
  }
}
function makeSpec(overrides: Partial<StaticCreativeSpec>): StaticCreativeSpec {
  return {
    supported: true, productionMethod: "REUSE", format: "static-image", width: 1080, height: 1080,
    headline: "Test headline", cta: "Test CTA", productImageAssetId: "a1", logoAssetId: null,
    layoutTemplate: "product-hero", missingComponents: [], reason: "Test",
    lineage: { sourceCreativeAssetIds: ["a1"], hybridDecision: "REUSE", hybridDecisionEvidence: [], creativeAngle: "Test angle", layoutTemplate: "product-hero" },
    costEvidence: { generationCalls: 0, imageGenerationCalls: 0, videoGenerationCalls: 0 }, ...overrides,
  }
}

console.log("=== CASE A: Physical product + good image -> media ready, master eligible ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget", productDescription: "A widget" },
    businessProductType: "PHYSICAL_PRODUCT", price: null, productUrl: null,
    businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "product_image" }],
  })
  assert(truth.mediaAvailability.hasProductPhoto === true, "media availability shows product photo")
  const eligibility = evaluateMasterEligibility({
    asset: { id: "a1", productId: "p1", workspaceId: "w1", category: "product_image", mimeType: "image/jpeg", widthPx: 1200, heightPx: 1200, fileSizeBytes: 50000 },
    context: { productId: "p1", workspaceId: "w1" },
  })
  assert(eligibility.eligibility === "ELIGIBLE", `master eligible (got ${eligibility.eligibility})`)
}

console.log("\n=== CASE B: Physical product + no image -> NEEDS_INPUT ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget" }, businessProductType: "PHYSICAL_PRODUCT",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [],
  })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec: makeSpec({}), selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "NEEDS_INPUT", `status is NEEDS_INPUT (got ${preflight.status})`)
}

console.log("\n=== CASE C: Technically insufficient image -> improvement recommendation, no fabrication ===")
{
  const eligibility = evaluateMasterEligibility({
    asset: { id: "a1", productId: "p1", workspaceId: "w1", category: "product_image", mimeType: "image/jpeg", widthPx: 500, heightPx: 500, fileSizeBytes: 50000 },
    context: { productId: "p1", workspaceId: "w1" },
  })
  assert(eligibility.eligibility === "IMPROVEMENT_REQUIRED", `improvement required, not silently accepted (got ${eligibility.eligibility})`)
  assert(eligibility.reasons.length > 0, "reasons are honestly reported")
}

console.log("\n=== CASE D: Service product + no physical photo -> does NOT incorrectly block ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Consulting" }, businessProductType: "SERVICE",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "brand_asset" }],
  })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec: makeSpec({}), selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "READY", `SERVICE with no product photo is READY, not blocked (got ${preflight.status})`)
}

console.log("\n=== CASE E: SaaS + screenshot -> appropriate media recognized ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "App" }, businessProductType: "SAAS_APP",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "screenshot" }],
  })
  assert(truth.mediaAvailability.hasScreenshot === true, "screenshot recognized in media availability")
}

console.log("\n=== CASE F: Wrong product asset -> cannot become master ===")
{
  const eligibility = evaluateMasterEligibility({
    asset: { id: "a1", productId: "OTHER-PRODUCT", workspaceId: "w1", category: "product_image", mimeType: "image/jpeg", widthPx: 1200, heightPx: 1200, fileSizeBytes: 50000 },
    context: { productId: "p1", workspaceId: "w1" },
  })
  assert(eligibility.eligibility === "NOT_ELIGIBLE", `wrong product -> NOT_ELIGIBLE (got ${eligibility.eligibility})`)
}

console.log("\n=== CASE G: Other workspace asset -> cannot become master ===")
{
  const eligibility = evaluateMasterEligibility({
    asset: { id: "a1", productId: "p1", workspaceId: "OTHER-WORKSPACE", category: "product_image", mimeType: "image/jpeg", widthPx: 1200, heightPx: 1200, fileSizeBytes: 50000 },
    context: { productId: "p1", workspaceId: "w1" },
  })
  assert(eligibility.eligibility === "NOT_ELIGIBLE", `wrong workspace -> NOT_ELIGIBLE (got ${eligibility.eligibility})`)
}

console.log("\n=== CASE J: Creative Preflight with all requirements -> READY ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget" }, businessProductType: "PHYSICAL_PRODUCT",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "product_image" }],
  })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec: makeSpec({}), selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "READY", `all requirements met -> READY (got ${preflight.status})`)
}

console.log("\n=== CASE K: Partial generation -> exact missing component identified ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget" }, businessProductType: "PHYSICAL_PRODUCT",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "product_image" }],
  })
  const spec = makeSpec({ supported: false, productionMethod: "PARTIAL_GENERATION", missingComponents: ["Lifestyle background"] })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({ decision: "PARTIAL_GENERATION", missingComponents: ["Lifestyle background"] }),
    spec, selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "GENERATION_REQUIRED", `status is GENERATION_REQUIRED (got ${preflight.status})`)
  assert(preflight.generationJustification !== null && preflight.generationJustification.includes("Lifestyle background"), "exact missing component named in justification")
}

console.log("\n=== CASE L: Full generation -> justification required ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget" }, businessProductType: "PHYSICAL_PRODUCT",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [],
  })
  const spec = makeSpec({ supported: false, productionMethod: "FULL_GENERATION" })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({ decision: "FULL_GENERATION", evidence: ["No relevant existing assets were found."] }),
    spec, selectedAssetsBelongToProduct: true,
  })
  assert(preflight.generationJustification !== null && preflight.generationJustification.length > 0, "full generation includes a justification, not just a bare flag")
}

console.log("\n=== CASE M: No headline/CTA -> preflight reports missing input, no fabrication ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Widget" }, businessProductType: "PHYSICAL_PRODUCT",
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "product_image" }],
  })
  const spec = makeSpec({ headline: null, cta: null })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec, selectedAssetsBelongToProduct: true,
  })
  const headlineCheck = preflight.checks.find((c) => c.label === "Headline/message exists")
  const ctaCheck = preflight.checks.find((c) => c.label === "CTA exists")
  assert(headlineCheck?.passed === false, "headline check honestly fails")
  assert(ctaCheck?.passed === false, "CTA check honestly fails")
  assert(headlineCheck?.detail.includes("none was fabricated") ?? false, "explicitly states nothing was fabricated")
}

console.log("\n=== CASE O (new): Unknown product type -> NEEDS_INPUT, customer-actionable, NOT silently physical ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Mystery Product" }, businessProductType: null,
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [],
  })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec: makeSpec({}), selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "NEEDS_INPUT", `unknown type -> NEEDS_INPUT (got ${preflight.status})`)
  const typeCheck = preflight.checks.find((c) => c.label === "Product type known")
  assert(typeCheck?.passed === false, "product type check honestly fails when unset")
  assert(typeCheck?.detail.includes("has not been set yet") ?? false, "reason is customer-actionable, not silent")
  const visualCheck = preflight.checks.find((c) => c.label === "Required product visual available")
  assert(visualCheck?.passed === true, "visual check does NOT incorrectly fail when type is merely unknown (not confirmed physical)")
}

console.log("\n=== CASE P (new): Unknown type with a photo already present -> still NEEDS_INPUT for classification, not silently READY ===")
{
  const truth = buildProductTruthProfile({
    brandName: "Test Brand", businessInput: { productName: "Mystery Product" }, businessProductType: null,
    price: null, productUrl: null, businessIntelligence: null, offerIntelligence: null, audienceIntelligence: null,
    mediaAssets: [{ category: "product_image" }],
  })
  const preflight = runCreativePreflight({
    productTruth: truth, hybridDecision: makeDecision({}), spec: makeSpec({}), selectedAssetsBelongToProduct: true,
  })
  assert(preflight.status === "NEEDS_INPUT", `unknown type still blocks READY even with media present (got ${preflight.status})`)
}

console.log("\n=== NOTE: Case H (master preferred in production), Case I (original preserved), ===")
console.log("=== and Case N (one creative per request) are structural guarantees verified by ===")
console.log("=== code inspection/design, not independently re-tested here - see report. ===")

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }