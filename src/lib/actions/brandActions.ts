"use server"

import { createClient } from "@/lib/supabase/server"
import { createBrand, type Brand } from "@/lib/repositories/brandRepository"

export interface CreateBrandResult {
  success: boolean
  data: Brand | null
  error: string | null
}

/**
 * Server Action: creates a brand within a workspace, on behalf of the
 * currently authenticated user.
 *
 * Unlike createWorkspaceAction, this does NOT require a SECURITY
 * DEFINER bootstrap function. By the time a user creates a brand,
 * their workspace_members row already exists (created atomically
 * during workspace creation via migration 013's
 * create_workspace_with_owner) - so the existing admins_can_create_brands
 * RLS policy (migration 003) can enforce authorization normally. This
 * is ordinary CRUD, correctly following the recorded pattern:
 * Client -> Server Action -> Repository -> RLS -> Database.
 *
 * getUser() here only provides a friendly early "must be logged in"
 * error - actual authorization (is this user admin+ of this
 * workspace) is enforced entirely by RLS underneath, not duplicated
 * in application code.
 */
export async function createBrandAction(
  workspaceId: string,
  name: string,
  website?: string
): Promise<CreateBrandResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to create a brand." }
  }

  if (!workspaceId) {
    return { success: false, data: null, error: "A workspace is required to create a brand." }
  }

  const trimmedName = name.trim()
  if (!trimmedName) {
    return { success: false, data: null, error: "Brand name is required." }
  }

  const result = await createBrand(workspaceId, trimmedName, website)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}