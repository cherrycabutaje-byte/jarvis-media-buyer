import { evaluateCreativeExecutionContextReadiness, validateContextAuthorization, type CreativeExecutionContextInput, type CreativeExecutionContextStatus } from "@/lib/product/creativeExecutionContext"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

function input(overrides: Partial<CreativeExecutionContextInput> = {}): CreativeExecutionContextInput {
  return {
    specificationId: "spec_1",
    primaryText: "Great product, try it today!",
    headline: null,
    description: null,
    destinationUrl: "https://example.com/product",
    callToActionType: "SHOP_NOW",
    pageId: "page_1",
    pageIdentityVerified: false,
    instagramActorId: null,
    ...overrides,
  }
}
function hasReason(result: ReturnType<typeof evaluateCreativeExecutionContextReadiness>, code: string): boolean {
  return result.reasons.some((r) => r.code === code)
}

console.log("=== CASE 1: Missing primaryText -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ primaryText: null }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_PRIMARY_TEXT"), "missing primary text blocks readiness")
}

console.log("\n=== CASE 2: Missing destinationUrl -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ destinationUrl: null }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_DESTINATION_URL"), "missing destination URL blocks readiness")
}

console.log("\n=== CASE 3: Malformed URL -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ destinationUrl: "not a url at all" }))
  assert(result.status === "NOT_READY" && hasReason(result, "INVALID_DESTINATION_URL"), "a malformed URL blocks readiness")
}

console.log("\n=== CASE 4: Unsupported URL scheme -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ destinationUrl: "ftp://example.com/file" }))
  assert(result.status === "NOT_READY" && hasReason(result, "INVALID_DESTINATION_URL"), "an unsupported scheme (ftp) blocks readiness")
}

console.log("\n=== CASE 5: Missing CTA -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ callToActionType: null }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_CALL_TO_ACTION"), "missing CTA blocks readiness")
}

console.log("\n=== CASE 6: Unsupported CTA -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ callToActionType: "SOME_UNSUPPORTED_CTA" }))
  assert(result.status === "NOT_READY" && hasReason(result, "UNSUPPORTED_CALL_TO_ACTION"), "an unrecognized CTA value blocks readiness - never an arbitrary string")
}

console.log("\n=== CASE 7: Missing Page identity -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ pageId: null }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_PAGE_IDENTITY"), "missing Page identity blocks readiness")
}

console.log("\n=== CASE 8: Unverified Page identity -> NOT_READY (confirmed STOP condition - honest for every real context in V1) ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ pageId: "page_1", pageIdentityVerified: false }))
  assert(result.status === "NOT_READY" && hasReason(result, "MISSING_PAGE_IDENTITY_VERIFICATION"), "an unverified Page ID - even if present - blocks readiness, since no trusted verification source exists in the current architecture")
}

console.log("\n=== CASE 9: Optional headline absent -> allowed ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ headline: null, pageIdentityVerified: true }))
  assert(!hasReason(result, "MISSING_HEADLINE"), "a missing headline is never itself a blocker (optional field)")
}

console.log("\n=== CASE 10: Optional description absent -> allowed ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ description: null, pageIdentityVerified: true }))
  assert(!hasReason(result, "MISSING_DESCRIPTION"), "a missing description is never itself a blocker (optional field)")
}

console.log("\n=== CASE 11: Optional Instagram identity absent -> allowed ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ instagramActorId: null, pageIdentityVerified: true }))
  assert(!hasReason(result, "MISSING_INSTAGRAM_IDENTITY"), "a missing Instagram actor ID is never itself a blocker (optional field)")
}

console.log("\n=== CASE 12: Complete, verified fixture -> READY (positive control - only reachable via an in-memory test, never real data) ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ pageIdentityVerified: true }))
  assert(result.status === "READY", `a fully concrete, verified, hypothetical fixture evaluates READY, proving the validator is not hardcoded to always reject (got ${result.status}, reasons: ${JSON.stringify(result.reasons)})`)
  assert(result.reasons.length === 0, "a READY result carries zero blocking reasons")
}

console.log("\n=== CASE 13: Primary text exceeding maximum length -> NOT_READY ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ primaryText: "a".repeat(6000) }))
  assert(result.status === "NOT_READY" && hasReason(result, "PRIMARY_TEXT_TOO_LONG"), "primary text exceeding the storage-driven length bound blocks readiness")
}

console.log("\n=== CASE 14: Multiple blockers returned together, not just the first ===")
{
  const result = evaluateCreativeExecutionContextReadiness(input({ primaryText: null, destinationUrl: null, callToActionType: null, pageId: null }))
  assert(result.status === "NOT_READY" && result.reasons.length >= 4, `multiple distinct blockers are all returned together (got ${result.reasons.length})`)
}

console.log("\n=== AUTHORIZATION TRANSITION 1: READY + AUTHORIZE -> AUTHORIZED ===")
{
  const result = validateContextAuthorization("READY_FOR_OWNER_AUTHORIZATION", "AUTHORIZE")
  assert(result.valid === true && result.resultingStatus === "AUTHORIZED", "READY + AUTHORIZE resolves to AUTHORIZED")
}

console.log("\n=== AUTHORIZATION TRANSITION 2: READY + DECLINE -> DECLINED ===")
{
  const result = validateContextAuthorization("READY_FOR_OWNER_AUTHORIZATION", "DECLINE")
  assert(result.valid === true && result.resultingStatus === "DECLINED", "READY + DECLINE resolves to DECLINED")
}

console.log("\n=== AUTHORIZATION TRANSITION 3: DRAFT + AUTHORIZE rejected (finalized execution context immutable - proposal binding proof) ===")
{
  const statuses: CreativeExecutionContextStatus[] = ["DRAFT", "AUTHORIZED", "DECLINED", "SUPERSEDED"]
  const allRejected = statuses.every((s) => !validateContextAuthorization(s, "AUTHORIZE").valid)
  assert(allRejected, "no status other than READY_FOR_OWNER_AUTHORIZATION can ever be authorized - no reauthorization, no decision reversal")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }