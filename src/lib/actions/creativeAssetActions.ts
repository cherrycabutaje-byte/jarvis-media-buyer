"use server"

import { createClient } from "@/lib/supabase/server"
import {
  createCreativeAsset,
  deleteCreativeAsset,
  getCreativeAssetById,
  type CreativeAsset,
  type CreativeAssetCategory,
  type CreativeAssetSource,
} from "@/lib/repositories/creativeAssetRepository"
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository"

export interface CreateCreativeAssetResult {
  success: boolean
  data: CreativeAsset | null
  error: string | null
}

/**
 * Server Action: records metadata for a file already uploaded
 * directly from the browser to Supabase Storage (RLS-protected,
 * using the same client-side session - never a Server Action proxy
 * for file bytes, and never the service-role client).
 *
 * Verifies the caller is a genuine member of the target workspace
 * before inserting - the underlying INSERT is additionally
 * protected by creative_assets' own RLS policy
 * (admins_can_create_creative_assets), so this is defense-in-depth
 * consistent with this project's established convention, not the
 * only authorization check.
 */
export async function createCreativeAssetAction(params: {
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
}): Promise<CreateCreativeAssetResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in." }
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === params.workspaceId)

  if (!isMember) {
    return { success: false, data: null, error: "You are not a member of this workspace." }
  }

  const result = await createCreativeAsset({
    ...params,
    uploadedBy: userData.user.id,
  })

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }
  return { success: true, data: result.data, error: null }
}

export interface DeleteCreativeAssetResult {
  success: boolean
  error: string | null
  storagePath: string | null
}

/**
 * Server Action: deletes a creative asset's metadata row. Returns
 * the storage_path so the caller can separately remove the file
 * from Storage using the browser's own RLS-protected client (never
 * a service-role deletion). Ownership is verified before deletion -
 * fetches the row first to confirm it belongs to a workspace the
 * caller is genuinely a member of, in addition to the table's own
 * RLS DELETE policy.
 */
export async function deleteCreativeAssetAction(assetId: string): Promise<DeleteCreativeAssetResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", storagePath: null }
  }

  const assetResult = await getCreativeAssetById(assetId)
  if (assetResult.error || !assetResult.data) {
    return { success: false, error: assetResult.error ?? "Asset not found.", storagePath: null }
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id)
  const isMember = workspacesResult.data?.some((w) => w.id === assetResult.data!.workspace_id)

  if (!isMember) {
    return { success: false, error: "You are not authorized to delete this asset.", storagePath: null }
  }

  const storagePath = assetResult.data.storage_path
  const deleteResult = await deleteCreativeAsset(assetId)

  if (deleteResult.error) {
    return { success: false, error: deleteResult.error, storagePath: null }
  }
  return { success: true, error: null, storagePath }
}