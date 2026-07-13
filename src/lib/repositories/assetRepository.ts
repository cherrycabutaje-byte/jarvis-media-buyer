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
 * Creates the FIRST asset (version_number = 1) for a product.
 *
 * Deliberately does NOT compute MAX(version_number) + 1 - this
 * function is only valid when no asset yet exists for the product.
 * Regeneration and general next-version calculation are explicitly
 * out of scope for this slice and belong to a future one. This
 * function does not check hasExistingAsset() itself - the caller is
 * responsible for that check, keeping this a pure, minimal insert.
 */
export async function createFirstAsset(params: {
  productId: string
  architectureVersion: string
  assetPayload: Record<string, unknown>
  assembledByJobId: string
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