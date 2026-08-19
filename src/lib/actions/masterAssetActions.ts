"use server"

import { createClient } from "@/lib/supabase/server"
import { getCreativeAssetById, setMasterAsset } from "@/lib/repositories/creativeAssetRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"
import { evaluateMasterEligibility } from "@/lib/product/masterProductAsset"

export interface SetMasterAssetResult {
  success: boolean
  error: string | null
}

/**
 * Product Truth + Master Product Asset V1 slice.
 *
 * Re-verifies eligibility server-side (workspace, ownership,
 * category, deterministic quality) before setting is_master - never
 * trusts client-supplied eligibility. Only ever toggles the
 * is_master flag on the existing row; never touches storage_path or
 * any other field (Step 14's preservation requirement).
 */
export async function setMasterAssetAction(productId: string, assetId: string): Promise<SetMasterAssetResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in." }
  }

  const assetResult = await getCreativeAssetById(assetId)
  if (assetResult.error || !assetResult.data) {
    return { success: false, error: assetResult.error ?? "Asset not found." }
  }
  const asset = assetResult.data

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === asset.workspace_id)
  if (!isMember) {
    return { success: false, error: "You are not authorized to modify this asset." }
  }

  const eligibility = evaluateMasterEligibility({
    asset: {
      id: asset.id,
      productId: asset.product_id,
      workspaceId: asset.workspace_id,
      category: asset.category,
      mimeType: asset.mime_type,
      widthPx: asset.width_px,
      heightPx: asset.height_px,
      fileSizeBytes: asset.file_size_bytes,
    },
    context: { productId, workspaceId: asset.workspace_id },
  })

  if (eligibility.eligibility === "NOT_ELIGIBLE") {
    return { success: false, error: eligibility.reasons.join(" ") || "This asset cannot become the master product asset." }
  }

  const result = await setMasterAsset(productId, assetId)
  if (result.error) {
    return { success: false, error: result.error }
  }
  return { success: true, error: null }
}