import { createClient } from "@/lib/supabase/server"
import type { Asset, RepositoryResult } from "@/lib/repositories/assetRepository"

export type ApprovalDecision = "approved" | "rejected" | "changes_requested"

/**
 * Calls the review_asset() SECURITY DEFINER function (migration 023),
 * which atomically inserts one append-only asset_approvals audit row
 * and updates assets.approval_status. All business rules - row-lock
 * concurrency protection, decision/notes validation, eligibility
 * checks (status = draft, approval_status = pending), and workspace
 * authorization via is_workspace_member() - live entirely inside
 * that function. This repository does not duplicate any of that
 * logic; it only calls the RPC and normalizes the result/error shape
 * to match the project's existing repository conventions.
 *
 * Does not add updateAsset(), setApprovalStatus(), or any general
 * asset mutation helper - this is the only command this repository
 * exposes. The frozen AssetRepository (First Asset Creation) is not
 * modified or extended by this file.
 */
export async function reviewAsset(
  assetId: string,
  decision: ApprovalDecision,
  notes: string | null
): Promise<RepositoryResult<Asset>> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("review_asset", {
    p_asset_id: assetId,
    p_decision: decision,
    p_notes: notes,
  })

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Asset, error: null }
}