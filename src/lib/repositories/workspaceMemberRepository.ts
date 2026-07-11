import { createClient } from '@/lib/supabase/server'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  joined_at: string
  display_name: string | null
}

export interface WorkspaceInvite {
  id: string
  workspace_id: string
  email: string
  role: WorkspaceRole
  invited_by: string
  status: string
  token: string
  created_at: string
  expires_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const MEMBER_COLUMNS = 'workspace_id, user_id, role, joined_at, profiles(display_name)'

interface RawMemberRow {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  joined_at: string
  profiles: { display_name: string | null } | null
}

function toWorkspaceMember(row: RawMemberRow): WorkspaceMember {
  return {
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    role: row.role,
    joined_at: row.joined_at,
    display_name: row.profiles?.display_name ?? null,
  }
}

/**
 * Fetches every member of a workspace, including their display name.
 */
export async function getMembersForWorkspace(
  workspaceId: string
): Promise<RepositoryResult<WorkspaceMember[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('workspace_id', workspaceId)

  if (error) {
    return { data: null, error: error.message }
  }

  const rows = (data ?? []) as unknown as RawMemberRow[]
  return { data: rows.map(toWorkspaceMember), error: null }
}

/**
 * Fetches a single member of a workspace by user id.
 */
export async function getMemberByUserId(
  workspaceId: string,
  userId: string
): Promise<RepositoryResult<WorkspaceMember>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select(MEMBER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: toWorkspaceMember(data as unknown as RawMemberRow), error: null }
}

/**
 * Creates a pending invite record.
 *
 * Supported by the frozen schema via the workspace_invites table
 * (migration 003). Important distinction: this creates the invite
 * record only - it does not itself grant workspace access. Converting
 * an accepted invite into an actual workspace_members row requires a
 * separate accept-invite flow, which does not yet exist and is out of
 * scope for this repository.
 */
export async function inviteMember(
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
  invitedBy: string
): Promise<RepositoryResult<WorkspaceInvite>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_invites')
    .insert({ workspace_id: workspaceId, email, role, invited_by: invitedBy })
    .select('id, workspace_id, email, role, invited_by, status, token, created_at, expires_at')
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as WorkspaceInvite, error: null }
}

/**
 * Updates a member's role.
 *
 * Owner-protection is enforced by an existing database trigger
 * (prevent_admin_owner_modification, migration 003) - an admin cannot
 * change an owner's role or grant owner rank. Any such violation
 * surfaces here as a returned error, not duplicated application logic.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<RepositoryResult<WorkspaceMember>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select(MEMBER_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: toWorkspaceMember(data as unknown as RawMemberRow), error: null }
}

/**
 * Removes a member from a workspace.
 *
 * Owner-protection is enforced by the same existing database trigger -
 * an admin cannot remove an owner. Any such violation surfaces here as
 * a returned error.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}