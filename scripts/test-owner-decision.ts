import { validateOwnerDecision, evaluateActionProposalFreshness, ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS } from "@/lib/product/ownerDecision"
import fs from "node:fs"
import path from "node:path"

let passed = 0
let failed = 0
function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  PASS: ${label}`) }
  else { failed++; console.log(`  FAIL: ${label}`) }
}

const NOW = new Date("2026-08-29T12:00:00.000Z")
function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()
}

console.log("=== CASE 1: A new proposal (created right now) is fresh ===")
{
  const result = evaluateActionProposalFreshness(NOW.toISOString(), NOW)
  assert(result === "FRESH", `a brand-new proposal is FRESH (got ${result})`)
}

console.log("\n=== CASE 2: 71h59m59s old is fresh (boundary, just under the threshold) ===")
{
  const createdAt = new Date(NOW.getTime() - (71 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000)).toISOString()
  const result = evaluateActionProposalFreshness(createdAt, NOW)
  assert(result === "FRESH", `71h59m59s old is still FRESH (got ${result})`)
}

console.log("\n=== CASE 3: Exactly 72h old is expired (boundary, exactly at the threshold) ===")
{
  const createdAt = hoursAgo(ACTION_PROPOSAL_APPROVAL_MAX_AGE_HOURS)
  const result = evaluateActionProposalFreshness(createdAt, NOW)
  assert(result === "EXPIRED", `exactly 72h old is EXPIRED, not FRESH (got ${result})`)
}

console.log("\n=== CASE 4: Older than 72h is expired ===")
{
  const result = evaluateActionProposalFreshness(hoursAgo(200), NOW)
  assert(result === "EXPIRED", `200h old is EXPIRED (got ${result})`)
}

console.log("\n=== CASE 5: Invalid created_at fails closed ===")
{
  const result = evaluateActionProposalFreshness("not-a-real-timestamp", NOW)
  assert(result === "INVALID", `an unparseable timestamp fails closed to INVALID, never FRESH (got ${result})`)
}

console.log("\n=== CASE 5b: A future created_at also fails closed (untrustworthy, not 'very fresh') ===")
{
  const futureTimestamp = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString()
  const result = evaluateActionProposalFreshness(futureTimestamp, NOW)
  assert(result === "INVALID", `a created_at in the future fails closed to INVALID (got ${result})`)
}

console.log("\n=== CASE 6: Fresh + PENDING_OWNER_REVIEW + APPROVE -> APPROVED ===")
{
  const result = validateOwnerDecision("PENDING_OWNER_REVIEW", "APPROVE", "FRESH")
  assert(result.valid === true && result.resultingStatus === "APPROVED", `fresh pending proposal can be approved (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 7: Fresh + PENDING_OWNER_REVIEW + DECLINE -> DECLINED ===")
{
  const result = validateOwnerDecision("PENDING_OWNER_REVIEW", "DECLINE", "FRESH")
  assert(result.valid === true && result.resultingStatus === "DECLINED", `fresh pending proposal can be declined (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 8: Stale (EXPIRED freshness) + PENDING_OWNER_REVIEW + APPROVE -> never APPROVED, resolves to EXPIRED ===")
{
  const result = validateOwnerDecision("PENDING_OWNER_REVIEW", "APPROVE", "EXPIRED")
  assert(result.resultingStatus !== "APPROVED", "a stale proposal can never become APPROVED")
  assert(result.resultingStatus === "EXPIRED", `a stale proposal resolves to EXPIRED regardless of the requested decision (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 9: Stale (EXPIRED freshness) + PENDING_OWNER_REVIEW + DECLINE -> never DECLINED, resolves to EXPIRED ===")
{
  const result = validateOwnerDecision("PENDING_OWNER_REVIEW", "DECLINE", "EXPIRED")
  assert(result.resultingStatus !== "DECLINED", "a stale proposal can never become DECLINED")
  assert(result.resultingStatus === "EXPIRED", `a stale proposal resolves to EXPIRED regardless of the requested decision (got ${result.resultingStatus})`)
}

console.log("\n=== CASE 10: Stale pending proposal transitions to EXPIRED (explicit, direct proof) ===")
{
  const result = validateOwnerDecision("PENDING_OWNER_REVIEW", "APPROVE", "EXPIRED")
  assert(result.valid === true && result.resultingStatus === "EXPIRED", "the valid, legal outcome for a stale pending proposal is EXPIRED")
}

console.log("\n=== CASE 11: EXPIRED (terminal) cannot become APPROVED ===")
{
  const result = validateOwnerDecision("EXPIRED", "APPROVE", "FRESH")
  assert(result.valid === false && result.resultingStatus === null, `an already-EXPIRED proposal can never be approved after the fact (got valid=${result.valid}, status=${result.resultingStatus})`)
}

console.log("\n=== CASE 12: EXPIRED (terminal) cannot become DECLINED ===")
{
  const result = validateOwnerDecision("EXPIRED", "DECLINE", "FRESH")
  assert(result.valid === false && result.resultingStatus === null, "an already-EXPIRED proposal can never be declined after the fact")
}

console.log("\n=== CASE 13: APPROVED (terminal) cannot become EXPIRED ===")
{
  const result = validateOwnerDecision("APPROVED", "APPROVE", "EXPIRED")
  assert(result.valid === false, "an already-APPROVED proposal never transitions to EXPIRED, even if re-evaluated as stale")
}

console.log("\n=== CASE 14: DECLINED (terminal) cannot become EXPIRED ===")
{
  const result = validateOwnerDecision("DECLINED", "APPROVE", "EXPIRED")
  assert(result.valid === false, "an already-DECLINED proposal never transitions to EXPIRED, even if re-evaluated as stale")
}

console.log("\n=== CASE 15: Expiration never fabricates decided_by (structural proof on the repository) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  const fnMatch = source.match(/export async function expireActionProposal[\s\S]*?\n}/)
  assert(fnMatch !== null, "expireActionProposal exists")
  const fnBody = fnMatch ? fnMatch[0] : ""
  assert(!fnBody.includes("decided_by") && !fnBody.includes("decided_at"), "the expiration repository function never sets decided_by or decided_at - expiration is never misrepresented as a human decision")
}

console.log("\n=== CASE 16: Cross-brand tampering cannot trigger expiration either (structural proof - same guard applies to the whole decide path) ===")
{
  // A lazy regex on nested braces would truncate too early - bound
  // the search precisely between this function's start and the
  // start of the next top-level function that follows it in the file.
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const startIdx = source.indexOf("export async function decideActionProposalAction")
  const endIdx = source.indexOf("function toRawRowForProposal", startIdx)
  const fnBody = source.slice(startIdx, endIdx)
  const brandCheckIndex = fnBody.indexOf("existingResult.data.brand_id !== brandId")
  const freshnessIndex = fnBody.indexOf("evaluateActionProposalFreshness")
  assert(brandCheckIndex > 0 && freshnessIndex > 0 && brandCheckIndex < freshnessIndex, "the cross-brand ownership check runs BEFORE freshness/expiration is ever evaluated - a cross-brand caller is rejected before reaching the expiration path at all")
}

console.log("\n=== CASE 17: Cross-workspace access is rejected before the expiration path is ever reached (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const startIdx = source.indexOf("export async function decideActionProposalAction")
  const endIdx = source.indexOf("function toRawRowForProposal", startIdx)
  const fnBody = source.slice(startIdx, endIdx)
  const accessCheckIndex = fnBody.indexOf('verifyBrandAccess(brandId)')
  const freshnessIndex = fnBody.indexOf("evaluateActionProposalFreshness")
  assert(accessCheckIndex >= 0 && accessCheckIndex < freshnessIndex, "workspace/brand membership (verifyBrandAccess) is checked before freshness is ever evaluated, closing the cross-workspace path")
}

console.log("\n=== CASE 18: An unauthorized caller cannot exploit the expiration path (structural proof - auth runs first, unconditionally) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/actions/actionProposalActions.ts"), "utf-8")
  const startIdx = source.indexOf("export async function decideActionProposalAction")
  const endIdx = source.indexOf("function toRawRowForProposal", startIdx)
  const fnBody = source.slice(startIdx, endIdx)
  const accessCheckIndex = fnBody.indexOf("verifyBrandAccess(brandId)")
  const proposalFetchIndex = fnBody.indexOf("getActionProposalById")
  assert(accessCheckIndex >= 0 && accessCheckIndex < proposalFetchIndex, "authorization (verifyBrandAccess) runs before any proposal lookup or freshness logic - an unauthorized caller is rejected at the very first step")
}

console.log("\n=== CASE 19: Concurrency - the atomic WHERE-status guard is shared by decide AND expire, permitting only one terminal transition (structural proof) ===")
{
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/repositories/actionProposalRepository.ts"), "utf-8")
  const decideMatch = source.match(/export async function decideActionProposal[\s\S]*?\n}/)
  const expireMatch = source.match(/export async function expireActionProposal[\s\S]*?\n}/)
  const decideHasGuard = decideMatch ? decideMatch[0].includes('.eq("status", "PENDING_OWNER_REVIEW")') : false
  const expireHasGuard = expireMatch ? expireMatch[0].includes('.eq("status", "PENDING_OWNER_REVIEW")') : false
  assert(decideHasGuard && expireHasGuard, "both decideActionProposal and expireActionProposal use the identical atomic UPDATE...WHERE guard - whichever request's UPDATE commits first at the database level wins, and the other affects zero rows")
}

console.log("\n=== CASE 20: Expired proposals show no Approve/Decline/Execute controls, with the required customer message (structural proof) ===")
{
  const uiSource = fs.readFileSync(path.join(process.cwd(), "src/components/PerformanceMonitorSection.tsx"), "utf-8")
  assert(uiSource.includes("no longer current enough for approval"), "the required EXPIRED explanation text is present")
  assert(!(/EXPIRED[\s\S]{0,400}>\s*Approve\s*</.test(uiSource)), "no Approve control appears near the EXPIRED branch")
  assert(!uiSource.includes(">Execute<"), "no Execute control exists anywhere in the UI")
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`)
if (failed > 0) { process.exit(1) }