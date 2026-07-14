import { createClient } from "@/lib/supabase/server"
import type { Asset, RepositoryResult } from "@/lib/repositories/assetRepository"

/**
 * Calls the mark_asset_ready() SECURITY DEFINER function
 * (migration 024), which atomically transitions assets.status from
 * 'draft' to 'ready' when approval_status is already 'approved'.
 * All business rules - row-lock concurrency protection, eligibility
 * checks (status = draft, approval_status = approved), and
 * workspace authorization via is_workspace_member() - live entirely
 * inside that function. This repository does not duplicate any of
 * that logic; it only calls the RPC and normalizes the result/error
 * shape to match the project's existing repository conventions.
 *
 * Does not add updateAsset(), setAssetStatus(), or any general
 * asset mutation helper - this is the only command this repository
 * exposes. The frozen AssetRepository (First Asset Creation) and
 * AssetApprovalRepository (Asset Approval Decision) are not
 * modified or extended by this file.
 */
export async function markAssetReady(assetId: string): Promise<RepositoryResult<Asset>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("mark_asset_ready", {
    p_asset_id: assetId,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Asset, error: null }
}