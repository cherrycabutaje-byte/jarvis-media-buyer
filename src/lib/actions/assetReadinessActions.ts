"use server"

import { createClient } from "@/lib/supabase/server"
import { markAssetReady } from "@/lib/repositories/assetReadinessRepository"
import type { Asset } from "@/lib/repositories/assetRepository"

export interface MarkAssetReadyResult {
  success: boolean
  data: Asset | null
  error: string | null
}

/**
 * Server Action: marks one draft/approved asset as ready.
 *
 * All business rules (eligibility, workspace authorization,
 * concurrency protection) are enforced entirely inside the frozen
 * mark_asset_ready() database function - this action performs no
 * additional validation beyond a basic presence check, matching the
 * established pattern used by every other Server Action in this
 * project (e.g. createJobAction, createFirstAssetFromJobAction,
 * reviewAssetAction).
 */
export async function markAssetReadyAction(assetId: string): Promise<MarkAssetReadyResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to mark an asset ready." }
  }

  if (!assetId) {
    return { success: false, data: null, error: "Asset ID is required." }
  }

  const result = await markAssetReady(assetId)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}