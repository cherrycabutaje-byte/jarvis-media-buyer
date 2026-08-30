import { createClient } from "@/lib/supabase/server"
import type { SpecificationActionType } from "@/lib/product/concreteActionSpecification"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Concrete Action Specification V1 slice.
 *
 * Dedicated table (action_specifications), deliberately separate
 * from action_proposals - see migration
 * 20260829000001_action_specifications.sql for the full
 * architectural rationale.
 *
 * IMMUTABILITY: every UPDATE in this repository is gated by an
 * atomic .eq("status", "DRAFT") guard - the exact same concurrency
 * principle already proven for action_proposals'
 * decideActionProposal/expireActionProposal. Once a row reaches
 * READY_FOR_OWNER_AUTHORIZATION or SUPERSEDED, that guard can never
 * match again, so the row becomes immutable without needing a
 * trigger. There is no function anywhere in this file that updates
 * a non-DRAFT row's execution-relevant fields.
 */
export interface StoredActionSpecification {
  id: string
  workspace_id: string
  brand_id: string
  proposal_id: string
  action_type: string
  meta_ad_account_id: string | null
  target_entity_type: string | null
  target_entity_id: string | null
  creative_asset_id: string | null
  proposed_spend_cents: number | null
  currency: string | null
  status: string
  created_at: string
  created_by: string
  finalized_at: string | null
  decided_at: string | null
  decided_by: string | null
}

const SPECIFICATION_COLUMNS =
  "id, workspace_id, brand_id, proposal_id, action_type, meta_ad_account_id, target_entity_type, target_entity_id, creative_asset_id, proposed_spend_cents, currency, status, created_at, created_by, finalized_at, decided_at, decided_by"

export async function createDraftSpecification(params: {
  workspaceId: string
  brandId: string
  proposalId: string
  actionType: SpecificationActionType
  metaAdAccountId: string | null
  createdBy: string
}): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .insert({
      workspace_id: params.workspaceId,
      brand_id: params.brandId,
      proposal_id: params.proposalId,
      action_type: params.actionType,
      meta_ad_account_id: params.metaAdAccountId,
      status: "DRAFT",
      created_by: params.createdBy,
    })
    .select(SPECIFICATION_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

export async function getActionSpecificationById(id: string): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("action_specifications").select(SPECIFICATION_COLUMNS).eq("id", id).single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

export async function getActionSpecificationsForProposal(proposalId: string): Promise<RepositoryResult<StoredActionSpecification[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .select(SPECIFICATION_COLUMNS)    .select(SPECIFICATION_COLUMNS)
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredActionSpecification[], error: null }
}

/**
 * Updates a DRAFT specification's editable fields. Atomically
 * guarded by status = 'DRAFT' - once finalized, this function can
 * never mutate the row (affects zero rows and returns an error).
 */
export async function updateDraftSpecification(
  id: string,
  updates: {
    targetEntityType?: string | null
    targetEntityId?: string | null
    creativeAssetId?: string | null
    proposedSpendCents?: number | null
    currency?: string | null
  }
): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {}
  if (updates.targetEntityType !== undefined) patch.target_entity_type = updates.targetEntityType
  if (updates.targetEntityId !== undefined) patch.target_entity_id = updates.targetEntityId
  if (updates.creativeAssetId !== undefined) patch.creative_asset_id = updates.creativeAssetId
  if (updates.proposedSpendCents !== undefined) patch.proposed_spend_cents = updates.proposedSpendCents
  if (updates.currency !== undefined) patch.currency = updates.currency

  const { data, error } = await supabase
    .from("action_specifications")
    .update(patch)
    .eq("id", id)
    .eq("status", "DRAFT")
    .select(SPECIFICATION_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

/**
 * Transitions DRAFT -> READY_FOR_OWNER_AUTHORIZATION. The atomic
 * status = 'DRAFT' guard means this can only ever happen once per
 * row - after this succeeds, every field on the row becomes
 * immutable (no function in this file can update a non-DRAFT row).
 *
 * READY_FOR_OWNER_AUTHORIZATION is NOT execution authorization and
 * is NEVER auto-granted further status - Concrete Owner
 * Authorization is a future slice, not built here.
 */
export async function finalizeSpecification(id: string): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .update({ status: "READY_FOR_OWNER_AUTHORIZATION", finalized_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "DRAFT")
    .select(SPECIFICATION_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

/**
 * Transitions READY_FOR_OWNER_AUTHORIZATION -> SUPERSEDED, so a new
 * revised specification can be created separately rather than
 * mutating this finalized row's execution-relevant fields. Only a
 * READY row can be superseded - a DRAFT is simply updated in place
 * (via updateDraftSpecification), and an already-SUPERSEDED row can
 * never be superseded again.
 */
export async function supersedeSpecification(id: string): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .update({ status: "SUPERSEDED" })
    .eq("id", id)
    .eq("status", "READY_FOR_OWNER_AUTHORIZATION")
    .select(SPECIFICATION_COLUMNS)
    .single()
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

/**
 * Lists the exact Meta entities (of a given grain, e.g. "AD_SET")
 * that have genuinely been synced/observed for a specific Meta ad
 * account link - never an invented ID. This is the canonical,
 * honest source for "available choices" of an exact target: an
 * entity_id only appears here if the Meta Ads read provider actually
 * observed it during a prior sync. If a brand's account has never
 * had ad-set/ad level data synced, this correctly returns an empty
 * list rather than fabricating a target.
 */
export async function listSyncedEntitiesForLink(linkId: string, entityType: string): Promise<RepositoryResult<string[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meta_ad_observations")
    .select("entity_id")
    .eq("meta_ad_account_link_id", linkId)
    .eq("entity_type", entityType)

  if (error) {
    return { data: null, error: error.message }
  }
  const uniqueIds = Array.from(new Set((data ?? []).map((row) => row.entity_id as string)))
  return { data: uniqueIds, error: null }
}

/**
 * Concrete Owner Authorization V1 slice.
 *
 * Records an explicit human authorization decision. Atomically
 * guarded by .eq("status", "READY_FOR_OWNER_AUTHORIZATION") - the
 * exact same concurrency principle already proven for
 * finalizeSpecification and action_proposals' decideActionProposal:
 * a race between two simultaneous decisions (or an authorize vs a
 * decline) can never both succeed, since after the first commits,
 * the second's UPDATE affects zero rows.
 *
 * decided_at/decided_by are THIS table's OWN authorization
 * provenance - never the proposal's. Once this succeeds, no
 * function anywhere can mutate this row's execution-relevant
 * fields again (the row is no longer DRAFT or READY, so both
 * updateDraftSpecification and finalizeSpecification's own guards
 * can never match it).
 */
export async function authorizeSpecification(id: string, authorizedByUserId: string): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .update({ status: "AUTHORIZED", decided_at: new Date().toISOString(), decided_by: authorizedByUserId })
    .eq("id", id)
    .eq("status", "READY_FOR_OWNER_AUTHORIZATION")
    .select(SPECIFICATION_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}

/**
 * Records an explicit human decline decision. Never modifies the
 * proposal, spend, target, creative, or Meta account - only this
 * row's own status and authorization provenance. Uses the identical
 * atomic guard as authorizeSpecification, so an AUTHORIZE and a
 * DECLINE racing on the same row can never both succeed.
 */
export async function declineSpecification(id: string, declinedByUserId: string): Promise<RepositoryResult<StoredActionSpecification>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("action_specifications")
    .update({ status: "DECLINED", decided_at: new Date().toISOString(), decided_by: declinedByUserId })
    .eq("id", id)
    .eq("status", "READY_FOR_OWNER_AUTHORIZATION")
    .select(SPECIFICATION_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredActionSpecification, error: null }
}