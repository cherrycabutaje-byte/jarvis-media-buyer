import { decideImageImprovement } from "@/lib/product/imageImprovement"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

console.log("=== CASE A: Good real photo -> USE_AS_IS, no processing claimed ===")
{
  const result = decideImageImprovement({ widthPx: 1500, heightPx: 1500, fileSizeBytes: 200000, mimeType: "image/jpeg" })
  assert(result.decision === "USE_AS_IS", `decision is USE_AS_IS (got ${result.decision})`)
  assert(result.deterministicOperations.length === 0, "no operations claimed when none are needed")
}

console.log("\n=== CASE B: Oversized image -> DETERMINISTIC_IMPROVEMENT, safe operations named ===")
{
  const result = decideImageImprovement({ widthPx: 5000, heightPx: 5000, fileSizeBytes: 2000000, mimeType: "image/jpeg" })
  assert(result.decision === "DETERMINISTIC_IMPROVEMENT", `decision is DETERMINISTIC_IMPROVEMENT (got ${result.decision})`)
  assert(result.deterministicOperations.some((o) => o.toLowerCase().includes("fit")), "safe-fit operation named")
  assert(result.targetMaxDimension !== null, "target dimension is set")
}

console.log("\n=== CASE C: Extreme aspect ratio -> DETERMINISTIC_IMPROVEMENT (safe-fit branch reachable) ===")
{
  // NOTE: given current thresholds, an extreme aspect ratio (>3.5)
  // with a min dimension >=1000 (recommended) mathematically implies
  // a max dimension >3500, which the module correctly (and more
  // conservatively) classifies via the oversized path first - both
  // are genuinely safe DETERMINISTIC_IMPROVEMENT outcomes. This test
  // uses a realistic wide-banner fixture that is both oversized and
  // extreme-aspect-ratio, confirming the module still safely resolves
  // to DETERMINISTIC_IMPROVEMENT rather than misclassifying it.
  const result = decideImageImprovement({ widthPx: 4000, heightPx: 800, fileSizeBytes: 500000, mimeType: "image/jpeg" })
  assert(result.decision === "DETERMINISTIC_IMPROVEMENT", `decision is DETERMINISTIC_IMPROVEMENT (got ${result.decision})`)
  assert(result.deterministicOperations.length > 0, "safe deterministic operations are named")
  assert(result.targetMaxDimension !== null, "target dimension is set")
}

console.log("\n=== CASE C2 (revised): Extreme aspect ratio is merged into the oversized/safe-fit path, not a separate branch ===")
{
  // CTO-directed cleanup: exhaustively confirmed (see
  // imageImprovement.ts's own inline comment) that a standalone
  // "extreme aspect ratio only" condition can never fire
  // independently under the current thresholds - it is always
  // accompanied by isOversized. The two conditions were merged into
  // one branch rather than kept as misleading, unreachable coverage.
  // This test exercises the merged condition directly with a
  // genuinely wide, extreme-ratio fixture, confirming the real,
  // reachable code path still produces the correct, safe outcome.
  const result = decideImageImprovement({ widthPx: 3600, heightPx: 700, fileSizeBytes: 400000, mimeType: "image/jpeg" })
  assert(result.decision === "DETERMINISTIC_IMPROVEMENT", `wide + extreme ratio -> DETERMINISTIC_IMPROVEMENT (got ${result.decision})`)
  assert(result.deterministicOperations.length > 0, "safe deterministic operations are named")
  assert(result.targetMaxDimension === 1080, "target dimension is the standard output size")
}

console.log("\n=== CASE D: Genuinely low resolution -> AI_IMPROVEMENT_REQUIRED, honestly NOT claimed fixable ===")
{
  const result = decideImageImprovement({ widthPx: 700, heightPx: 700, fileSizeBytes: 50000, mimeType: "image/jpeg" })
  assert(result.decision === "AI_IMPROVEMENT_REQUIRED", `decision is AI_IMPROVEMENT_REQUIRED (got ${result.decision})`)
  assert(result.deterministicOperations.length === 0, "no deterministic operation falsely claimed to fix real resolution loss")
  assert(result.requiredCapability !== null && result.requiredCapability.length > 0, "the real missing capability is honestly named")
}

console.log("\n=== CASE E: Insufficient/too small -> REPLACEMENT_RECOMMENDED ===")
{
  const result = decideImageImprovement({ widthPx: 100, heightPx: 100, fileSizeBytes: 5000, mimeType: "image/jpeg" })
  assert(result.decision === "REPLACEMENT_RECOMMENDED", `decision is REPLACEMENT_RECOMMENDED (got ${result.decision})`)
  assert(result.requiredCapability === null, "no fabricated capability claim for a fundamentally unusable source")
}

console.log("\n=== CASE F: Non-image file -> REPLACEMENT_RECOMMENDED ===")
{
  const result = decideImageImprovement({ widthPx: 1500, heightPx: 1500, fileSizeBytes: 200000, mimeType: "video/mp4" })
  assert(result.decision === "REPLACEMENT_RECOMMENDED", `decision is REPLACEMENT_RECOMMENDED for non-image (got ${result.decision})`)
}

console.log("\n=== CASE G: Reuses the frozen assessImageQuality gate, does not duplicate its logic ===")
{
  // Same boundary the frozen gate uses (400px minimum) - if this module had
  // silently duplicated/diverged from the gate's own threshold, this would
  // disagree with the gate's own documented behavior.
  const result = decideImageImprovement({ widthPx: 350, heightPx: 350, fileSizeBytes: 50000, mimeType: "image/jpeg" })
  assert(result.decision === "REPLACEMENT_RECOMMENDED", `below the gate's own minimum -> REPLACEMENT_RECOMMENDED (got ${result.decision})`)
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }