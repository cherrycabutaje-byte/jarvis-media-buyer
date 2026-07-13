"use server"

import { createClient } from "@/lib/supabase/server"
import { reviewAsset, type ApprovalDecision } from "@/lib/repositories/assetApprovalRepository"
import type { Asset } from "@/lib/repositories/assetRepository"

export interface ReviewAssetResult {
  success: boolean
  data: Asset | null
  error: string | null
}

/**
 * Server Action: submits one review decision for one asset.
 *
 * All business rules (eligibility, notes requirements, workspace
 * authorization, concurrency protection) are enforced entirely
 * inside the frozen review_asset() database function - this action
 * performs no additional validation beyond a basic presence check,
 * matching the established pattern used by every other Server
 * Action in this project (e.g. createJobAction, createFirstAssetFromJobAction).
 */
export async function reviewAssetAction(
  assetId: string,
  decision: ApprovalDecision,
  notes: string | null
): Promise<ReviewAssetResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to review an asset." }
  }

  if (!assetId) {
    return { success: false, data: null, error: "Asset ID is required." }
  }
  if (!decision) {
    return { success: false, data: null, error: "A decision is required." }
  }

  const result = await reviewAsset(assetId, decision, notes)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}