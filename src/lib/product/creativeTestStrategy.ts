/**
 * Spend-Isolated Creative Test Strategy V1 - INVESTIGATION-DERIVED
 * pure domain model only. No persistence, no Server Actions, no
 * provider-contract changes, no execution code exist in this slice.
 *
 * RESOLVES (architecturally, not yet implemented) the SPEND_MODEL_UNSUPPORTED
 * finding from Meta Execution Plan V1: inserting a new ad into an
 * existing, already-running AD_SET cannot guarantee a per-creative
 * spend ceiling, because Meta's delivery/auction system dynamically
 * distributes the ad set's own shared budget across every ad within
 * it.
 *
 * STRONGEST RESEARCHED CANDIDATE - NOT YET SELECTED, NOT IMPLEMENTED:
 * Meta's own purpose-built "Creative Test" capability (Marketing API
 * ad_studies, type=SPLIT_TEST_V2). Verified as genuinely existing via
 * two official Meta developer documentation pages (a guide page
 * updated Aug 14, 2026, and a reference page updated Mar 24, 2026,
 * whose version selector lists only v22.0-v25.0 - v26.0 support is
 * NOT confirmed on that page). A creative_test_config carries a
 * dedicated daily_budget or lifetime_budget_percentage, "allocated
 * across the cells' ads" per the reference page - genuinely separate
 * from the underlying ad set's/campaign's own budget field.
 *
 * FINAL VERDICT AFTER TWO ROUNDS OF PRIMARY-SOURCE VERIFICATION:
 * STRATEGY_NOT_YET_SAFE_TO_SELECT. This candidate remains the
 * strongest one investigated, but is NOT approved as JARVIS's
 * execution strategy. Material, currently unverified gaps include:
 * exact permission requirements, PAUSED-ad eligibility as a cell
 * participant, whether daily_budget's total exposure over the study's
 * full start_time-to-end_time duration can be deterministically
 * mapped to an owner-authorized maximum, the lifetime_budget_percentage
 * denominator, and a trusted Business-ID discovery/binding mechanism.
 * Additionally, the reference page's own documented Limitations
 * confirm the study transitions to "running" automatically once
 * start_time arrives (no separate, documented activation step exists)
 * and that studies cannot be deleted via the API ("You can't perform
 * this operation on this endpoint") - both materially weaker safety
 * properties than an earlier draft of this investigation assumed.
 *
 * WHY THIS RESOLVES THE BLOCKER: the new alternative-creative Ad still
 * needs to be created inside the existing, already-authorized AD_SET
 * (a genuine CREATE_NEW_OBJECT, never a MUTATE_EXISTING_OBJECT on the
 * ad set/campaign) - but its spend during the test period is governed
 * by the Creative Test's OWN budget object, not the ad set's shared
 * budget. The original ad and ad set remain READ_ONLY throughout
 * (referenced by ID only, never mutated).
 *
 * TWO GENUINE, CONFIRMED REMAINING GAPS (found by inspection, not
 * invented) mean this strategy CANNOT yet be implemented:
 *
 * 1. AUTHORIZATION_SCOPE_INSUFFICIENT: the current Concrete Owner
 *    Authorization covers only { account, target AD_SET, creative
 *    asset ID, spend, currency } for a single new Ad. It does NOT
 *    cover authorizing the creation of a genuinely NEW top-level
 *    object (an ad_study with its own budget, cells, and schedule).
 *    The owner has never been shown or asked to authorize "JARVIS
 *    will create a new Business-level Creative Test object with a
 *    dedicated €X budget over Y days, comparing your existing ad
 *    against a new one." Silently expanding the existing
 *    authorization to cover this would violate the explicit
 *    "previous authorization != authorization of newly discovered
 *    side effects" invariant already established in this codebase.
 *    A new, dedicated authorization slice is required before any
 *    execution code.
 *
 * 2. meta_business_id MAY BE ABSENT: confirmed directly from the live
 *    schema - meta_ad_account_links.meta_business_id is a nullable
 *    column with no NOT NULL constraint and no requirement that it
 *    be populated at connection time. Since ad_studies is created at
 *    the BUSINESS level (not the ad-account level), a brand whose
 *    link never captured a Business ID cannot use this strategy at
 *    all without a separate capability to obtain/verify one first.
 *
 * This module therefore models ONLY the pure domain distinctions and
 * invariants needed to reason about this strategy safely - it proves
 * these invariants deterministically, and correctly fails closed for
 * every real specification today (since neither gap above is resolved
 * yet).
 */

export type CreativeTestStrategyType = "AD_SET_INSERTION" | "DEDICATED_TEST_AD_SET" | "META_CREATIVE_TEST" | "UNSUPPORTED"

export type CreativeTestReadinessStatus = "STRATEGY_VIABLE" | "STRATEGY_NOT_VIABLE"

export interface CreativeTestReason {
  code: string
  message: string
}

export interface CreativeTestReadinessResult {
  status: CreativeTestReadinessStatus
  reasons: CreativeTestReason[]
}

/**
 * Pure input representing the trusted, persisted facts a future
 * caller would supply - never client-asserted. Distinguishes every
 * concept the CTO's own directive required kept separate: a
 * proposed test spend is NEVER the same field as the owner's maximum
 * authorization, which is NEVER the same field as whatever budget
 * value is actually configured on the Meta object, which is NEVER
 * the same field as Meta's own eventual actual spend (a fact this
 * module does not and cannot observe - see module documentation on
 * Meta's own documented daily-budget pacing tolerance).
 */
export interface CreativeTestStrategyInput {
  strategy: CreativeTestStrategyType
  proposedSpendCents: number | null
  maxAuthorizedSpendCents: number | null
  /** The budget value that would actually be configured on the
   * chosen Meta object (e.g. creative_test_config.daily_budget) -
   * always null until a real specification/authorization exists for
   * this strategy. Distinct from both proposed spend and the owner's
   * authorized maximum. */
  configuredMetaBudgetCents: number | null
  currency: string | null
  startTime: string | null
  endTime: string | null
  sourceCampaignId: string | null
  sourceAdSetId: string | null
  sourceAdId: string | null
  /** Required only for META_CREATIVE_TEST - ad_studies is created at
   * the Business level, not the ad-account level. */
  metaBusinessId: string | null
  /** Whether a genuine, dedicated authorization mechanism exists yet
   * for this exact strategy's newly-discovered side effects (a new
   * top-level object, its own budget, its own schedule). Always
   * false in V1 - no such authorization slice exists yet. */
  authorizationScopeCovers: boolean
  /** Whether the source Ad Set's full configuration (targeting,
   * budget, bid strategy, optimization goal, placements, schedule)
   * has genuinely been read and persisted - required only for
   * DEDICATED_TEST_AD_SET. Always false in V1 - confirmed by direct
   * inspection that metaAdsReadProvider.ts's MetaAdSetData/
   * MetaCampaignData capture only { id, name, status,
   * effectiveStatus } (+ objective/createdTime for campaigns) and
   * nothing else. */
  sourceAdSetConfigurationCaptured: boolean
}

function reason(code: string, message: string): CreativeTestReason {
  return { code, message }
}

/**
 * Pure, deterministic evaluator. Proves the architectural invariants
 * required before ANY execution-plan readiness could ever depend on
 * this strategy - never itself creates, authorizes, or executes
 * anything.
 */
export function evaluateCreativeTestStrategyReadiness(input: CreativeTestStrategyInput): CreativeTestReadinessResult {
  const reasons: CreativeTestReason[] = []

  if (input.strategy === "UNSUPPORTED") {
    return { status: "STRATEGY_NOT_VIABLE", reasons: [reason("UNSUPPORTED_STRATEGY", "This test strategy is not currently supported.")] }
  }

  if (input.strategy === "AD_SET_INSERTION") {
    // Permanent, structural finding - can never be resolved by any
    // amount of additional data, since it is a fact about how Meta's
    // own delivery system works, not a data-availability gap.
    return {
      status: "STRATEGY_NOT_VIABLE",
      reasons: [
        reason(
          "SPEND_MODEL_UNSUPPORTED",
          "Meta does not support a guaranteed per-ad budget within an existing ad set - inserting another ad here can never be labeled spend-isolated."
        ),
      ],
    }
  }

  if (input.strategy === "DEDICATED_TEST_AD_SET" && !input.sourceAdSetConfigurationCaptured) {
    reasons.push(
      reason(
        "SOURCE_AD_SET_CONFIGURATION_INSUFFICIENT",
        "The source ad set's full configuration (targeting, budget, bid strategy, optimization, placements, schedule) has not been captured and cannot be safely recreated."
      )
    )
  }

  if (input.strategy === "META_CREATIVE_TEST" && !input.metaBusinessId) {
    reasons.push(reason("MISSING_META_BUSINESS_ID", "No Meta Business ID is available for this connection - required to create a Creative Test."))
  }

  if (!input.authorizationScopeCovers) {
    reasons.push(
      reason(
        "AUTHORIZATION_SCOPE_INSUFFICIENT",
        "The owner has not been asked to authorize the specific new object(s) and budget this strategy would create."
      )
    )
  }

  if (input.proposedSpendCents === null) {
    reasons.push(reason("MISSING_PROPOSED_SPEND", "A concrete test spend has not been proposed."))
  }
  if (input.maxAuthorizedSpendCents === null) {
    reasons.push(reason("MISSING_MAXIMUM_AUTHORIZATION", "No maximum authorized budget has been configured."))
  }
  // Permanent invariant: proposed spend is NEVER inferred from, nor
  // equated with, the owner's maximum authorization - both must be
  // explicitly, independently present and distinct concepts, even
  // when their numeric values happen to coincide.
  if (
    input.proposedSpendCents !== null &&
    input.maxAuthorizedSpendCents !== null &&
    input.proposedSpendCents > input.maxAuthorizedSpendCents
  ) {
    reasons.push(reason("SPEND_EXCEEDS_AUTHORIZED_MAXIMUM", "The proposed spend exceeds the owner's authorized maximum."))
  }
  if (input.configuredMetaBudgetCents === null && input.strategy === "META_CREATIVE_TEST") {
    reasons.push(reason("MISSING_CONFIGURED_META_BUDGET", "No concrete Meta-side test budget has been configured yet."))
  }

  if (!input.currency) {
    reasons.push(reason("MISSING_CURRENCY", "No currency has been set for the proposed test spend."))
  }
  if (!input.startTime || !input.endTime) {
    reasons.push(reason("MISSING_SCHEDULE", "A start and end time for the test have not been set."))
  }
  if (!input.sourceAdId) {
    reasons.push(reason("MISSING_SOURCE_AD", "No existing source ad has been identified to compare against."))
  }

  if (reasons.length > 0) {
    return { status: "STRATEGY_NOT_VIABLE", reasons }
  }

  return { status: "STRATEGY_VIABLE", reasons: [] }
}