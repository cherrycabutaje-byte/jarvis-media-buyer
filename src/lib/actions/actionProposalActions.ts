"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { insertActionProposal, getActionProposalsForBrand, getActionProposalById, decideActionProposal, expireActionProposal, type StoredActionProposal } from "@/lib/repositories/actionProposalRepository"
import { validateOwnerDecision, evaluateActionProposalFreshness, type OwnerDecisionType, type ActionProposalStatus, type FreshnessStatus } from "@/lib/product/ownerDecision"
import { evaluateExecutionEligibility, type ExecutionEligibilityInput, type ExecutionEligibilityResult } from "@/lib/product/executionGate"
import { createActionProposalContent, type ActionProposalContext } from "@/lib/product/actionProposal"
import type { SolutionCandidate } from "@/lib/product/solutionEngine"
import type { OwnerGuardrails } from "@/lib/product/ownerGuardrails"
import { getMetaAdAccountLinkForBrand } from "@/lib/repositories/metaAdAccountRepository"
import { getObservationsInRange, filterRowsByEntity } from "@/lib/repositories/metaAdObservationRepository"
import { aggregateObservations, comparePeriods, evaluateMonitor } from "@/lib/product/performanceAggregation"
import { evaluateEvidence, buildDiagnosticEvidencePacket } from "@/lib/product/evidenceGate"
import { runDiagnosticEngine } from "@/lib/product/diagnosticEngine"
import { runSolutionEngine, type SolutionContext } from "@/lib/product/solutionEngine"

/**
 * Owner Approval Workflow V1 slice: this file now contains decision
 * logic (decideActionProposalAction). Decisions never execute
 * anything and never call Meta - they only change the proposal's
 * own stored status.
 */

export interface CustomerFacingActionProposal {
  id: string
  entityType: string
  entityId: string
  label: string
  rationale: string
  estimatedRisk: string
  reversibility: string
  proposedSpendCents: number | null
  maxAuthorizedSpendCents: number | null
  guardrailDecision: string
  guardrailReasons: string[]
  status: string
  createdAt: string
  decidedAt: string | null
}

export interface ActionProposalListResult {
  success: boolean
  error: string | null
  proposals: CustomerFacingActionProposal[] | null
}

function toCustomerFacing(row: StoredActionProposal): CustomerFacingActionProposal {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.solution_candidate_label,
    rationale: row.rationale,
    estimatedRisk: row.estimated_risk,
    reversibility: row.reversibility,
    proposedSpendCents: row.proposed_spend_cents,
    maxAuthorizedSpendCents: row.max_authorized_spend_cents,
    guardrailDecision: row.guardrail_decision,
    guardrailReasons: row.guardrail_reasons,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  }
}

async function verifyBrandAccess(brandId: string): Promise<{ workspaceId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { error: "You must be logged in." }
  }
  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { error: brandResult.error ?? "Business not found." }
  }
  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === brandResult.data!.workspace_id)
  if (!isMember) {
    return { error: "You are not authorized to access this business." }
  }
  return { workspaceId: brandResult.data.workspace_id, userId: userData.user.id }
}

/**
 * Creates and persists an Action Proposal from an ELIGIBLE Solution
 * Engine candidate. Reuses createActionProposalContent() (the pure,
 * already-tested construction function) - this action's only added
 * responsibility is auth verification and persistence. Returns null
 * silently (no proposal, no error) when the candidate does not
 * qualify (not ELIGIBLE, or not an EXPERIMENT) - matching the pure
 * function's own contract.
 */
export async function createActionProposalAction(
  brandId: string,
  entityType: string,
  entityId: string,
  candidate: SolutionCandidate,
  guardrails: OwnerGuardrails
): Promise<{ success: boolean; error: string | null; proposal: CustomerFacingActionProposal | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, proposal: null }
  }

  const context: ActionProposalContext = {
    workspaceId: access.workspaceId,
    brandId,
    entityType,
    entityId,
    guardrails,
  }

  const content = createActionProposalContent(candidate, context)
  if (!content) {
    return { success: true, error: null, proposal: null }
  }

  const insertResult = await insertActionProposal(content, access.userId)
  if (insertResult.error || !insertResult.data) {
    return { success: false, error: insertResult.error ?? "Could not save the proposal.", proposal: null }
  }

  return { success: true, error: null, proposal: toCustomerFacing(insertResult.data) }
}

export async function listActionProposalsAction(brandId: string): Promise<ActionProposalListResult> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, proposals: null }
  }

  const result = await getActionProposalsForBrand(brandId)
  if (result.error) {
    return { success: false, error: result.error, proposals: null }
  }

  // Lazily expires any still-PENDING_OWNER_REVIEW proposal that has
  // gone stale, so the UI naturally reflects the true current state
  // without requiring the owner to click anything first. Uses the
  // SAME atomic expireActionProposal primitive as the decide path -
  // no separate expiration mechanism, no background job.
  const now = new Date()
  const rows = result.data ?? []
  const updatedRows = await Promise.all(
    rows.map(async (row) => {
      if (row.status !== "PENDING_OWNER_REVIEW") return row
      const freshness: FreshnessStatus = evaluateActionProposalFreshness(row.created_at, now)
      if (freshness === "FRESH") return row
      const expireResult = await expireActionProposal(row.id)
      return expireResult.data ?? row
    })
  )

  return { success: true, error: null, proposals: updatedRows.map(toCustomerFacing) }
}

/**
 * Re-runs the real pipeline server-side (Meta observations ->
 * Performance Monitor -> Evidence Gate -> Diagnostic Engine ->
 * Solution Engine) and creates a persisted Action Proposal for ONE
 * named candidate code, ONLY if that candidate is genuinely ELIGIBLE
 * according to this fresh, real computation.
 *
 * The client supplies only brandId/periods/entityType/entityId/
 * candidateCode - it never supplies a SolutionCandidate object
 * directly, so a tampered or stale client-side candidate can never
 * be used to fabricate a proposal. The owner's REAL guardrails
 * (already selected by getBrandById) are used, never invented.
 */
export async function proposeActionForCandidateAction(
  brandId: string,
  currentPeriod: { start: string; end: string },
  previousPeriod: { start: string; end: string },
  candidateCode: string
): Promise<{ success: boolean; error: string | null; proposal: CustomerFacingActionProposal | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, proposal: null }
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", proposal: null }
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  if (linkResult.error || !linkResult.data) {
    return { success: false, error: "No Meta ad account is connected for this business.", proposal: null }
  }

  const targetEntityType = "ACCOUNT"
  const targetEntityId = linkResult.data.meta_ad_account_id

  const currentRowsResult = await getObservationsInRange(linkResult.data.id, targetEntityType, targetEntityId, currentPeriod.start, currentPeriod.end)
  const previousRowsResult = await getObservationsInRange(linkResult.data.id, targetEntityType, targetEntityId, previousPeriod.start, previousPeriod.end)
  if (currentRowsResult.error || previousRowsResult.error) {
    return { success: false, error: currentRowsResult.error ?? previousRowsResult.error ?? "Could not read performance data.", proposal: null }
  }

  const currentRows = filterRowsByEntity(currentRowsResult.data ?? [], targetEntityType, targetEntityId)
  const previousRows = filterRowsByEntity(previousRowsResult.data ?? [], targetEntityType, targetEntityId)

  const currentAggregated = aggregateObservations(currentRows.map(toRawRowForProposal))
  const previousAggregated = aggregateObservations(previousRows.map(toRawRowForProposal))
  const comparison = comparePeriods(currentAggregated, previousAggregated)
  const monitor = evaluateMonitor(currentAggregated, previousAggregated, comparison)

  const evidenceContext = {
    workspaceId: brandResult.data.workspace_id,
    brandId,
    metaAdAccountLinkId: linkResult.data.id,
    entityType: targetEntityType,
    entityId: targetEntityId,
    comparisonEntityType: targetEntityType,
    comparisonEntityId: targetEntityId,
    comparisonWorkspaceId: brandResult.data.workspace_id,
    currentPeriod,
    comparisonPeriod: previousPeriod,
    currentObservationSyncedAt: extractOldestSyncTimestampForProposal(currentRows),
    isHistoricalAnalysis: false,
  }
  const evidenceGateResult = evaluateEvidence(evidenceContext, currentAggregated, previousAggregated, monitor)
  const diagnosticPacket = buildDiagnosticEvidencePacket(evidenceContext, evidenceGateResult, monitor)
  const diagnosticResult = runDiagnosticEngine(diagnosticPacket)

  const guardrails: OwnerGuardrails = {
    authorityMode: (brandResult.data.authority_mode as OwnerGuardrails["authorityMode"]) ?? null,
    currency: brandResult.data.budget_currency,
    monthlyBudgetCents: brandResult.data.monthly_budget_cents,
    dailyMaximumCents: brandResult.data.daily_maximum_cents,
    maxTestBudgetCents: brandResult.data.max_test_budget_cents,
  }

  const solutionContext: SolutionContext = {
    capabilities: { creativeLibraryAvailable: true, staticCreativeProductionAvailable: true, metaWriteAvailable: false, hasEligibleExistingAsset: null },
    budget: { maxTestBudgetCents: guardrails.maxTestBudgetCents, currency: guardrails.currency },
    ownerObjective: brandResult.data.objective,
  }
  const solutionResult = runSolutionEngine(diagnosticResult, solutionContext)

  const candidate = solutionResult.candidates.find((c) => c.code === candidateCode)
  if (!candidate) {
    return { success: false, error: "That option is no longer available based on current data.", proposal: null }
  }

  const context: ActionProposalContext = {
    workspaceId: access.workspaceId,
    brandId,
    entityType: targetEntityType,
    entityId: targetEntityId,
    guardrails,
  }

  const content = createActionProposalContent(candidate, context)
  if (!content) {
    return { success: false, error: "This option is not currently eligible to propose.", proposal: null }
  }

  const insertResult = await insertActionProposal(content, access.userId)
  if (insertResult.error || !insertResult.data) {
    return { success: false, error: insertResult.error ?? "Could not save the proposal.", proposal: null }
  }

  return { success: true, error: null, proposal: toCustomerFacing(insertResult.data) }
}

function toRawRowForProposal(row: Record<string, unknown>) {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v))
  return {
    spend: num(row.spend), impressions: num(row.impressions), reach: num(row.reach), frequency: num(row.frequency),
    clicks: num(row.clicks), linkClicks: num(row.link_clicks), results: num(row.results),
    purchaseConversionValue: num(row.purchase_conversion_value),
    currency: typeof row.currency === "string" ? row.currency : null,
  }
}

function extractOldestSyncTimestampForProposal(rows: Array<Record<string, unknown>>): string | null {
  const timestamps = rows
    .map((r) => (typeof r.last_synced_at === "string" ? Date.parse(r.last_synced_at) : NaN))
    .filter((t) => !Number.isNaN(t))
  if (timestamps.length === 0) return null
  return new Date(Math.min(...timestamps)).toISOString()
}

/**
 * Records an explicit owner decision (approve or decline) on an
 * ELIGIBLE-derived proposal. Never executes anything and never
 * calls Meta - this only changes the proposal's own stored status,
 * decided_at, and decided_by.
 *
 * Cross-brand tampering closure: verifying access to brandId alone
 * does not confirm proposalId actually belongs to that brand. RLS's
 * own policy (gated on the row's real workspace_id) already
 * prevents a genuine cross-tenant leak, but this explicit
 * application-layer check gives a clear, honest error message and
 * closes the gap in depth rather than relying on RLS alone.
 *
 * Double-decision race closure: the repository's own atomic
 * UPDATE...WHERE status = 'PENDING_OWNER_REVIEW' guard means two
 * simultaneous decisions can never both succeed - the second's
 * update affects zero rows and is reported as an honest failure.
 */
export async function decideActionProposalAction(
  brandId: string,
  proposalId: string,
  decision: OwnerDecisionType
): Promise<{ success: boolean; error: string | null; proposal: CustomerFacingActionProposal | null }> {
  // Server-side enforcement path, in exact order:
  // authenticate -> authorize workspace/brand -> fetch exact
  // persisted proposal -> verify proposal belongs to brand -> verify
  // PENDING_OWNER_REVIEW -> evaluate freshness -> decide or expire.
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, proposal: null }
  }

  const existingResult = await getActionProposalById(proposalId)
  if (existingResult.error || !existingResult.data) {
    return { success: false, error: "That proposal could not be found.", proposal: null }
  }
  if (existingResult.data.brand_id !== brandId) {
    return { success: false, error: "That proposal does not belong to this business.", proposal: null }
  }

  // Freshness is evaluated using the server's own current time and
  // the proposal's own persisted, trusted created_at - never a
  // client-supplied timestamp.
  const freshness = evaluateActionProposalFreshness(existingResult.data.created_at, new Date())

  const validation = validateOwnerDecision(existingResult.data.status as ActionProposalStatus, decision, freshness)
  if (!validation.valid || !validation.resultingStatus) {
    return { success: false, error: validation.reason ?? "This proposal cannot be decided.", proposal: null }
  }

  // A stale proposal resolves to EXPIRED regardless of which
  // decision was requested - expireActionProposal never sets
  // decided_at/decided_by, since expiration is a system-driven
  // lifecycle transition, never a fabricated human decision.
  const result =
    validation.resultingStatus === "EXPIRED"
      ? await expireActionProposal(proposalId)
      : await decideActionProposal(proposalId, validation.resultingStatus, access.userId)

  if (result.error || !result.data) {
    return { success: false, error: result.error ?? "Could not record your decision. It may have already been decided.", proposal: null }
  }

  return { success: true, error: null, proposal: toCustomerFacing(result.data) }
}

/**
 * Read-only server-side evaluation of whether an approved proposal
 * is safe and concrete enough to be eligible for a future executor.
 * Never mutates the proposal, guardrails, budget, or Meta connection
 * state it reads. Never calls Meta. Never spends money. The client
 * supplies only brandId/proposalId - never a proposal payload,
 * approval status, guardrail result, spend amount, Meta target, or
 * workspace/brand, so a forged client-side value can never be used
 * to fabricate an EXECUTABLE result.
 *
 * Server-side trust boundary, in exact order: authenticate ->
 * authorize workspace/brand -> fetch exact persisted proposal ->
 * verify proposal belongs to brand -> fetch the owner's CURRENT
 * guardrails -> fetch the brand's CURRENTLY live Meta ad account ->
 * evaluate.
 */
export async function evaluateExecutionReadinessAction(
  brandId: string,
  proposalId: string
): Promise<{ success: boolean; error: string | null; result: ExecutionEligibilityResult | null }> {
  const access = await verifyBrandAccess(brandId)
  if ("error" in access) {
    return { success: false, error: access.error, result: null }
  }

  const proposalResult = await getActionProposalById(proposalId)
  if (proposalResult.error || !proposalResult.data) {
    return { success: false, error: "That proposal could not be found.", result: null }
  }
  if (proposalResult.data.brand_id !== brandId) {
    return { success: false, error: "That proposal does not belong to this business.", result: null }
  }

  const brandResult = await getBrandById(brandId)
  if (brandResult.error || !brandResult.data) {
    return { success: false, error: brandResult.error ?? "Business not found.", result: null }
  }

  const currentGuardrails: OwnerGuardrails = {
    authorityMode: (brandResult.data.authority_mode as OwnerGuardrails["authorityMode"]) ?? null,
    currency: brandResult.data.budget_currency,
    monthlyBudgetCents: brandResult.data.monthly_budget_cents,
    dailyMaximumCents: brandResult.data.daily_maximum_cents,
    maxTestBudgetCents: brandResult.data.max_test_budget_cents,
  }

  const linkResult = await getMetaAdAccountLinkForBrand(brandId)
  const currentMetaAdAccountId = linkResult.data ? linkResult.data.meta_ad_account_id : null

  const row = proposalResult.data
  const eligibilityInput: ExecutionEligibilityInput = {
    proposal: {
      solutionCandidateCode: row.solution_candidate_code,
      category: row.category,
      status: row.status as ActionProposalStatus,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      decidedBy: row.decided_by,
      entityType: row.entity_type,
      entityId: row.entity_id,
      proposedSpendCents: row.proposed_spend_cents,
      maxAuthorizedSpendCents: row.max_authorized_spend_cents,
      // Not currently persisted anywhere in V1 - see executionGate.ts
      // module documentation for why this is always null today.
      proposedCurrency: null,
      // Not currently captured anywhere in V1 - only an account-level
      // entityId exists.
      targetMetaEntityId: null,
      // Not currently captured anywhere in V1 - no creative asset
      // selection field exists.
      creativeAssetId: null,
    },
    currentGuardrails,
    currentMetaAdAccountId,
  }

  return { success: true, error: null, result: evaluateExecutionEligibility(eligibilityInput) }
}