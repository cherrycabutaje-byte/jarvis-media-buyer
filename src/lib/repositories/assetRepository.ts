import { createClient } from "@/lib/supabase/server"

export interface Asset {
  id: string
  product_id: string
  version_number: number
  parent_asset_id: string | null
  architecture_version: string
  status: string
  asset_payload: Record<string, unknown>
  created_at: string
  approval_status: string
  assembled_by_job_id: string | null
  regeneration_reason: string | null
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const ASSET_COLUMNS =
  "id, product_id, version_number, parent_asset_id, architecture_version, status, asset_payload, created_at, approval_status, assembled_by_job_id, regeneration_reason"

/**
 * Checks whether any asset already exists for a product. This slice
 * only supports first-asset creation (version_number = 1) - if any
 * asset already exists, createFirstAsset() must not be called; the
 * caller (Server Action) is responsible for checking this first and
 * returning the intended unsupported-operation error. This function
 * does not enforce that itself, to keep it a minimal, single-purpose
 * check matching this slice's narrow scope.
 */
export async function hasExistingAsset(productId: string): Promise<RepositoryResult<boolean>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("assets").select("id").eq("product_id", productId).limit(1)
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data?.length ?? 0) > 0, error: null }
}

/**
 * Creative Production Engine V1 slice addition. Reads any existing
 * asset for a product (the most recent by version_number), if one
 * exists. Used to source real, literal ad copy
 * (asset_payload.rawText) for static creative production - the
 * only genuinely literal ad copy source in this project. Returns
 * null data (not an error) when no asset exists yet - an expected,
 * normal state for a product with no prior text_generation-derived
 * asset.
 */
export async function getFirstAssetForProduct(productId: string): Promise<RepositoryResult<Asset | null>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("product_id", productId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data as Asset | null) ?? null, error: null }
}

/**
 * Creates the FIRST asset (version_number = 1) for a product.
 *
 * Deliberately does NOT compute MAX(version_number) + 1 - this
 * function is only valid when no asset yet exists for the product.
 * Regeneration and general next-version calculation are explicitly
 * out of scope for this slice and belong to a future one. This
 * function does not check hasExistingAsset() itself - the caller is
 * responsible for that check, keeping this a pure, minimal insert.
 *
 * UNCHANGED since the Creative Production Engine V1 CTO-directed
 * fix - its sole caller (createFirstAssetFromJobAction in
 * assetActions.ts) continues to use this exact function, exactly as
 * before. New callers needing a SUBSEQUENT version for a product
 * that may already have assets should use
 * createNextAssetVersion() instead, which is concurrency-safe for
 * that general case.
 *
 * assembledByJobId is nullable - deterministic static creative
 * production has no async Worker job at all (no AI call, no queue
 * needed), so there is genuinely no job id to record in that case.
 */
export async function createFirstAsset(params: {
  productId: string
  architectureVersion: string
  assetPayload: Record<string, unknown>
  assembledByJobId: string | null
}): Promise<RepositoryResult<Asset>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("assets")
    .insert({
      product_id: params.productId,
      version_number: 1,
      architecture_version: params.architectureVersion,
      asset_payload: params.assetPayload,
      assembled_by_job_id: params.assembledByJobId,
    })
    .select(ASSET_COLUMNS)
    .single()
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Asset, error: null }
}

/**
 * Creative Production Engine V1 slice addition - CTO-directed fix.
 *
 * Creates the NEXT asset version for a product, regardless of how
 * many versions already exist (including zero). Calls the
 * create_next_asset_version() SECURITY DEFINER database function
 * (migration 20260819000002), which atomically computes the next
 * version_number under an advisory lock scoped to this exact
 * product - safe against concurrent callers, unlike a client-side
 * MAX(version_number)+1 read-then-write which would have a genuine
 * race window.
 *
 * This does NOT overwrite, mutate, or replace any existing asset -
 * it always inserts a new, independent row. The frozen approval/
 * readiness triggers (enforce_approval_before_publish,
 * enforce_published_asset_immutability) only fire on UPDATE, never
 * on INSERT, so prior approved/published versions are structurally
 * unaffected by this operation regardless of their state.
 */
export async function createNextAssetVersion(params: {
  productId: string
  architectureVersion: string
  assetPayload: Record<string, unknown>
  assembledByJobId?: string | null
  parentAssetId?: string | null
  regenerationReason?: string | null
}): Promise<RepositoryResult<Asset>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_next_asset_version", {
    p_product_id: params.productId,
    p_architecture_version: params.architectureVersion,
    p_asset_payload: params.assetPayload,
    p_assembled_by_job_id: params.assembledByJobId ?? null,
    p_parent_asset_id: params.parentAssetId ?? null,
    p_regeneration_reason: params.regenerationReason ?? null,
  })
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Asset, error: null }
}
