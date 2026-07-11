"use server"

import { createClient } from "@/lib/supabase/server"
import { createWorkspace, type Workspace } from "@/lib/repositories/workspaceRepository"

export interface CreateWorkspaceResult {
  success: boolean
  data: Workspace | null
  error: string | null
}

/**
 * Server Action: creates a workspace on behalf of the currently
 * authenticated user.
 *
 * Identity is derived server-side from the verified session via
 * supabase.auth.getUser() - never trusted from client input. This
 * calls getUser() (not getSession()) specifically because getUser()
 * verifies the token against the Supabase Auth server, which is the
 * correct way to confirm authentication server-side; getSession() is
 * only safe to trust in that stronger sense within proxy.ts's
 * getClaims()-based flow, which serves a different purpose (session
 * refresh, not authorization decisions).
 *
 * Delegates all actual data access to the existing, frozen
 * WorkspaceRepository - no repository logic is duplicated or
 * reimplemented here. RLS (migration 003) still applies underneath;
 * this action does not bypass or duplicate that enforcement.
 */
export async function createWorkspaceAction(name: string): Promise<CreateWorkspaceResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to create a workspace." }
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    return { success: false, data: null, error: "Workspace name is required." }
  }

  const result = await createWorkspace(trimmedName, userData.user.id)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}