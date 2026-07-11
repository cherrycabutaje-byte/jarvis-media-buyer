import { createClient } from '@/lib/supabase/server'

export interface Workspace {
  id: string
  name: string
  owner_id: string
  status: string
  created_at: string
  updated_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const WORKSPACE_COLUMNS = 'id, name, owner_id, status, created_at, updated_at'

/**
 * Fetches a single workspace by id.
 */
export async function getWorkspaceById(workspaceId: string): Promise<RepositoryResult<Workspace>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select(WORKSPACE_COLUMNS)
    .eq('id', workspaceId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Workspace, error: null }
}

/**
 * Fetches every workspace a given user belongs to, via workspace_members.
 */
export async function getWorkspacesForUser(userId: string): Promise<RepositoryResult<Workspace[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`workspaces (${WORKSPACE_COLUMNS})`)
    .eq('user_id', userId)

  if (error) {
    return { data: null, error: error.message }
  }

  const rows = (data ?? []) as unknown as Array<{ workspaces: Workspace | null }>
  const workspaces = rows.map((row) => row.workspaces).filter((w): w is Workspace => w !== null)

  return { data: workspaces, error: null }
}

/**
 * Creates a workspace and its owner membership row together.
 *
 * A workspace's owner is only granted access through a workspace_members
 * row (role 'owner') - RLS policies (migration 003) check
 * is_workspace_member(), not the owner_id column. Creating only the
 * workspaces row would produce a workspace invisible to its own owner.
 * This is a correctness requirement of the frozen schema, not
 * additional business logic.
 *
 * Note: PostgREST does not support multi-table client-side
 * transactions, so if the membership insert fails after the workspace
 * insert succeeds, this performs a best-effort compensating delete
 * rather than a guaranteed atomic rollback. A future, separately
 * approved migration adding a dedicated Postgres function (e.g.
 * create_workspace_with_owner) would make this atomic - flagged here,
 * not implemented, since Database Version 1.0 is frozen.
 */
export async function createWorkspace(
  name: string,
  ownerId: string
): Promise<RepositoryResult<Workspace>> {
  const supabase = await createClient()

  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({ name, owner_id: ownerId })
    .select(WORKSPACE_COLUMNS)
    .single()

  if (workspaceError || !workspace) {
    return { data: null, error: workspaceError?.message ?? 'Failed to create workspace.' }
  }

  const createdWorkspace = workspace as Workspace

  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({ workspace_id: createdWorkspace.id, user_id: ownerId, role: 'owner' })

  if (memberError) {
    await supabase.from('workspaces').delete().eq('id', createdWorkspace.id)
    return { data: null, error: memberError.message }
  }

  return { data: createdWorkspace, error: null }
}

/**
 * Updates a workspace's name and returns the updated row.
 */
export async function updateWorkspaceName(
  workspaceId: string,
  name: string
): Promise<RepositoryResult<Workspace>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name })
    .eq('id', workspaceId)
    .select(WORKSPACE_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Workspace, error: null }
}

/**
 * NOT YET SUPPORTED.
 *
 * The `workspaces` table (Database Version 1.0, migration 001, amended
 * in migration 003/004) has a `status` column, but its enum values
 * (trialing, active, past_due, suspended, canceled) represent
 * billing/subscription lifecycle state, not a generic user-initiated
 * archive flag. Reusing one of those values (e.g. 'canceled') to mean
 * "archived" would misuse a column with a different, already-defined
 * meaning. This function exists as a documented extension point only;
 * it deliberately throws rather than silently repurposing an existing
 * column. Implementing real archive behavior requires a future,
 * separately-approved migration - Database Version 1.0 remains frozen
 * until then.
 */
export async function archiveWorkspace(_workspaceId: string): Promise<RepositoryResult<Workspace>> {
  throw new Error(
    'archiveWorkspace is not yet supported: workspaces has no dedicated archive concept in the current frozen schema (Database Version 1.0). This requires a future, approved migration first.'
  )
}