import { createClient } from "@/lib/supabase/server"
import type { CallToActionType } from "@/lib/product/creativeExecutionContext"

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Creative Execution Context V1 slice.
 *
 * Dedicated table (creative_execution_contexts), deliberately
 * separate from action_specifications - see migration
 * 20260831000001_creative_execution_contexts.sql for the full
 * architectural rationale.
 *
 * IMMUTABILITY: every UPDATE in this repository is gated by an
 * atomic .eq("status", "DRAFT") guard, matching the exact same
 * concurrency/immutability principle already proven for
 * action_specifications.
 */
export interface StoredCreativeExecutionContext {
  id: string
  workspace_id: string
  brand_id: string
  specification_id: string
  primary_text: string | null
  headline: string | null
  description: string | null
  destination_url: string | null
  call_to_action_type: string | null
  page_id: string | null
  page_identity_verified: boolean
  instagram_actor_id: string | null
  status: string
  created_at: string
  created_by: string
  decided_at: string | null
  decided_by: string | null
}

const CONTEXT_COLUMNS =
  "id, workspace_id, brand_id, specification_id, primary_text, headline, description, destination_url, call_to_action_type, page_id, page_identity_verified, instagram_actor_id, status, created_at, created_by, decided_at, decided_by"

export async function createDraftCreativeExecutionContext(params: {
  workspaceId: string
  brandId: string
  specificationId: string
  createdBy: string
}): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .insert({
      workspace_id: params.workspaceId,
      brand_id: params.brandId,
      specification_id: params.specificationId,
      status: "DRAFT",
      created_by: params.createdBy,
    })
    .select(CONTEXT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}

export async function getCreativeExecutionContextById(id: string): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("creative_execution_contexts").select(CONTEXT_COLUMNS).eq("id", id).single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}

export async function getCreativeExecutionContextsForSpecification(  specificationId: string
): Promise<RepositoryResult<StoredCreativeExecutionContext[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .select(CONTEXT_COLUMNS)
    .eq("specification_id", specificationId)
    .order("created_at", { ascending: false })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as StoredCreativeExecutionContext[], error: null }
}

/**
 * Updates a DRAFT context's editable fields. Atomically guarded by
 * status = 'DRAFT' - once past DRAFT, this function can never
 * mutate the row (affects zero rows, returns an error).
 * page_identity_verified is deliberately NOT settable through this
 * function - no application code path in V1 ever marks a Page as
 * verified, since no trusted verification source exists.
 */
export async function updateDraftCreativeExecutionContext(
  id: string,
  updates: {
    primaryText?: string | null
    headline?: string | null
    description?: string | null
    destinationUrl?: string | null
    callToActionType?: CallToActionType | null
    pageId?: string | null
    instagramActorId?: string | null
  }
): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {}
  if (updates.primaryText !== undefined) patch.primary_text = updates.primaryText
  if (updates.headline !== undefined) patch.headline = updates.headline
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.destinationUrl !== undefined) patch.destination_url = updates.destinationUrl
  if (updates.callToActionType !== undefined) patch.call_to_action_type = updates.callToActionType
  if (updates.pageId !== undefined) patch.page_id = updates.pageId
  if (updates.instagramActorId !== undefined) patch.instagram_actor_id = updates.instagramActorId

  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .update(patch)
    .eq("id", id)
    .eq("status", "DRAFT")
    .select(CONTEXT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}

export async function finalizeCreativeExecutionContext(id: string): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .update({ status: "READY_FOR_OWNER_AUTHORIZATION" })
    .eq("id", id)
    .eq("status", "DRAFT")
    .select(CONTEXT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}

/**
 * Records this context's OWN, entirely independent authorization
 * decision - never reusing or reinterpreting
 * action_specifications.decided_at/decided_by. Atomically guarded by
 * status = 'READY_FOR_OWNER_AUTHORIZATION', identical to
 * authorizeSpecification's own concurrency mechanism.
 */
export async function authorizeCreativeExecutionContext(
  id: string,
  authorizedByUserId: string
): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .update({ status: "AUTHORIZED", decided_at: new Date().toISOString(), decided_by: authorizedByUserId })
    .eq("id", id)
    .eq("status", "READY_FOR_OWNER_AUTHORIZATION")
    .select(CONTEXT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}

export async function declineCreativeExecutionContext(
  id: string,
  declinedByUserId: string
): Promise<RepositoryResult<StoredCreativeExecutionContext>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_execution_contexts")
    .update({ status: "DECLINED", decided_at: new Date().toISOString(), decided_by: declinedByUserId })
    .eq("id", id)
    .eq("status", "READY_FOR_OWNER_AUTHORIZATION")
    .select(CONTEXT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as StoredCreativeExecutionContext, error: null }
}