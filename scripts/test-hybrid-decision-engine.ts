import {
  decideCreativeProductionMethod,
  type CreativeRequirement,
  type CreativeAssetEvidence,
  type HybridDecisionContext,
} from "@/lib/hybrid/hybridCreativeDecisionEngine"

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

const context: HybridDecisionContext = {
  workspaceId: "ws-1",
  productId: "prod-1",
  brandId: "brand-1",
}

const imageRequirement: CreativeRequirement = {
  requiredFormat: "image",
  formatRationale: "image - static format sufficient for current offer strength score of 6/10",
  creativeAngle: "Test angle",
  visualDirection: "Test visual",
  upstreamStatus: "complete",
  upstreamConfidence: 0.9,
}

const videoRequirement: CreativeRequirement = {
  ...imageRequirement,
  requiredFormat: "video",
  formatRationale: "video - offer strength score of 8/10 supports a fuller narrative format",
}

const unknownRequirement: CreativeRequirement = {
  ...imageRequirement,
  requiredFormat: "unknown",
  formatRationale: "",
}

let assetCounter = 0
function asset(overrides: Partial<CreativeAssetEvidence>): CreativeAssetEvidence {
  assetCounter++
  return {
    id: `asset-${assetCounter}`,
    category: "product_image",
    sourceType: "customer_upload",
    mimeType: "image/png",
    widthPx: 800,
    heightPx: 600,
    durationSeconds: null,
    productId: "prod-1",
    brandId: null,
    workspaceId: "ws-1",
    originalFilename: "test.png",
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

console.log("=== CASE A: Suitable single existing product asset -> REUSE ===")
{
  const result = decideCreativeProductionMethod(imageRequirement, [asset({})], context)
  assert(result.decision === "REUSE", `decision is REUSE (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 1, "exactly one asset selected")
}

console.log("\n=== CASE B: Strong base asset needing modification -> REDESIGN ===")
{
  const result = decideCreativeProductionMethod(
    imageRequirement,
    [asset({ category: "previous_creative", mimeType: "image/jpeg" })],
    context
  )
  assert(result.decision === "REDESIGN", `decision is REDESIGN (got ${result.decision})`)
}

console.log("\n=== CASE C: Multiple useful existing components -> REMIX ===")
{
  const result = decideCreativeProductionMethod(
    videoRequirement,
    [
      asset({ category: "product_image", mimeType: "image/png" }),
      asset({ category: "brand_asset", mimeType: "image/png", productId: null, brandId: "brand-1" }),
    ],
    context
  )
  assert(result.decision === "REMIX", `decision is REMIX (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 2, "both components selected")
}

console.log("\n=== CASE D: Useful component but required piece missing -> PARTIAL_GENERATION ===")
{
  const result = decideCreativeProductionMethod(
    videoRequirement,
    [asset({ category: "testimonial", mimeType: "image/png" })],
    context
  )
  assert(result.decision === "PARTIAL_GENERATION", `decision is PARTIAL_GENERATION (got ${result.decision})`)
}

console.log("\n=== CASE E: No suitable assets -> FULL_GENERATION ===")
{
  const result = decideCreativeProductionMethod(imageRequirement, [], context)
  assert(result.decision === "FULL_GENERATION", `decision is FULL_GENERATION (got ${result.decision})`)
}

console.log("\n=== CASE F: Wrong product's asset exists -> MUST NOT reuse it ===")
{
  const result = decideCreativeProductionMethod(
    imageRequirement,
    [asset({ productId: "OTHER-PRODUCT" })],
    context
  )
  assert(result.decision !== "REUSE", `decision is not REUSE (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 0, "no assets selected from wrong product")
}

console.log("\n=== CASE G: Other workspace's asset exists -> MUST NOT use it ===")
{
  const result = decideCreativeProductionMethod(
    imageRequirement,
    [asset({ workspaceId: "OTHER-WORKSPACE" })],
    context
  )
  assert(result.decision === "FULL_GENERATION", `decision is FULL_GENERATION (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 0, "no assets selected from other workspace")
}

console.log("\n=== CASE H: Only logo exists, product visual required -> MUST NOT classify as REUSE ===")
{
  const result = decideCreativeProductionMethod(
    imageRequirement,
    [asset({ category: "brand_asset", mimeType: "image/png", productId: null, brandId: "brand-1" })],
    context
  )
  assert(result.decision !== "REUSE", `decision is not REUSE (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 0, "logo not counted as satisfying the requirement")
}

console.log("\n=== CASE I: Insufficient evidence -> conservative decision/confidence ===")
{
  const result = decideCreativeProductionMethod(unknownRequirement, [asset({})], context)
  assert(result.decision === "FULL_GENERATION", `decision is FULL_GENERATION (got ${result.decision})`)
  assert(result.confidence <= 0.3, `confidence is conservatively low (got ${result.confidence})`)
}

console.log("\n=== CASE J: No Creative Library assets at all -> FULL_GENERATION ===")
{
  const result = decideCreativeProductionMethod(imageRequirement, [], context)
  assert(result.decision === "FULL_GENERATION", `decision is FULL_GENERATION (got ${result.decision})`)
  assert(result.selectedAssetIds.length === 0, "no assets selected")
}

console.log("\n=== EXTRA: Upstream partial-confidence capping ===")
{
  const partialRequirement: CreativeRequirement = { ...imageRequirement, upstreamStatus: "partial", upstreamConfidence: 0.2 }
  const result = decideCreativeProductionMethod(partialRequirement, [asset({})], context)
  assert(result.decision === "REUSE", `decision still REUSE on structural evidence (got ${result.decision})`)
  assert(result.confidence <= 0.6, `confidence capped due to upstream uncertainty (got ${result.confidence})`)
}

console.log("\n=== CASE M (new): Master asset preferred among multiple raw matches ===")
{
  const olderNonMaster = asset({ createdAt: "2020-01-01T00:00:00.000Z" })
  const newerMaster = asset({ isMaster: true, createdAt: "2020-01-02T00:00:00.000Z" })
  const result = decideCreativeProductionMethod(imageRequirement, [olderNonMaster, newerMaster], context)
  assert(result.decision === "REUSE", `decision is REUSE (got ${result.decision})`)
  assert(result.selectedAssetIds[0] === newerMaster.id, "the master asset is selected, not merely the most recent")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) {
  process.exit(1)
}