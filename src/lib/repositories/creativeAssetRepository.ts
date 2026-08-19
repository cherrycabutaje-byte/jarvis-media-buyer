import { createClient } from "@/lib/supabase/server"

export type CreativeAssetCategory =
  | "product_image"
  | "video"
  | "brand_asset"
  | "testimonial"
  | "previous_creative"
  | "product_in_use"
  | "packaging"
  | "screenshot"
export type CreativeAssetSource = "customer_upload" | "previous_creative"

export interface CreativeAsset {
  id: string
  workspace_id: string
  brand_id: string | null
  product_id: string | null
  category: CreativeAssetCategory
  source_type: CreativeAssetSource
  storage_path: string
  original_filename: string | null
  mime_type: string
  file_size_bytes: number
  width_px: number | null
  height_px: number | null
  duration_seconds: number | null
  uploaded_by: string
  created_at: string
  is_master: boolean
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

/**
 * Media Asset Foundation V1 slice.
 *
 * creative_assets is entirely separate from the frozen `assets`
 * table (publication pipeline) - see migration
 * 20260818000001_creative_asset_foundation.sql for the full
 * architectural rationale. Rows here are SOURCE material only and
 * can never become publishable through this repository - only the
 * existing, unmodified review_asset()/mark_asset_ready()/
 * create_publication_request() chain, operating on the separate
 * `assets` table, can do that.
 *
 * Uses the human-session server client (RLS-protected), matching
 * the same convention already established for brands/products -
 * no SECURITY DEFINER RPC is needed since RLS alone provides
 * correct workspace-scoped authorization for these simple,
 * single-table operations.
 */

const CREATIVE_ASSET_COLUMNS =
  "id, workspace_id, brand_id, product_id, category, source_type, storage_path, original_filename, mime_type, file_size_bytes, width_px, height_px, duration_seconds, uploaded_by, created_at, is_master"

export async function getCreativeAssetsForWorkspace(
  workspaceId: string,
  productId?: string
): Promise<RepositoryResult<CreativeAsset[]>> {
  const supabase = await createClient()
  let query = supabase
    .from("creative_assets")
    .select(CREATIVE_ASSET_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })

  if (productId) {
    query = query.eq("product_id", productId)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as CreativeAsset[], error: null }
}

export async function createCreativeAsset(params: {
  workspaceId: string
  brandId: string | null
  productId: string | null
  category: CreativeAssetCategory
  sourceType: CreativeAssetSource
  storagePath: string
  originalFilename: string | null
  mimeType: string
  fileSizeBytes: number
  widthPx: number | null
  heightPx: number | null
  durationSeconds: number | null
  uploadedBy: string
}): Promise<RepositoryResult<CreativeAsset>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_assets")
    .insert({
      workspace_id: params.workspaceId,
      brand_id: params.brandId,
      product_id: params.productId,
      category: params.category,
      source_type: params.sourceType,
      storage_path: params.storagePath,
      original_filename: params.originalFilename,
      mime_type: params.mimeType,
      file_size_bytes: params.fileSizeBytes,
      width_px: params.widthPx,
      height_px: params.heightPx,
      duration_seconds: params.durationSeconds,
      uploaded_by: params.uploadedBy,
    })
    .select(CREATIVE_ASSET_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as CreativeAsset, error: null }
}

export async function getCreativeAssetById(id: string): Promise<RepositoryResult<CreativeAsset>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("creative_assets")
    .select(CREATIVE_ASSET_COLUMNS)
    .eq("id", id)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as CreativeAsset, error: null }
}

export async function deleteCreativeAsset(id: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from("creative_assets").delete().eq("id", id)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}

/**
 * Product Truth + Master Product Asset V1 slice addition.
 *
 * Sets is_master = true on the target asset and false on every
 * other asset for the same product - exactly one master per
 * product at a time. Never touches storage_path, mime_type, or any
 * other field - the original file is never modified, copied, or
 * overwritten (Step 14's explicit preservation requirement). Two
 * plain RLS-protected updates (not a single atomic RPC) - acceptable
 * here since a transient moment with zero or two masters during a
 * race is a display-only inconsistency, not a security or data-loss
 * concern, unlike the version-number uniqueness the Creative
 * Production Engine's RPC protects.
 */
export async function setMasterAsset(productId: string, assetId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()

  const { error: clearError } = await supabase
    .from("creative_assets")
    .update({ is_master: false })
    .eq("product_id", productId)
    .eq("is_master", true)

  if (clearError) {
    return { data: null, error: clearError.message }
  }

  const { error: setError } = await supabase.from("creative_assets").update({ is_master: true }).eq("id", assetId)

  if (setError) {
    return { data: null, error: setError.message }
  }
  return { data: null, error: null }
}
