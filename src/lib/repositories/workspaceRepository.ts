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
 * UPDATED (migration 013): this now calls the create_workspace_with_owner
 * SECURITY DEFINER database function via RPC, rather than performing two
 * separate client-side inserts with a best-effort compensating delete.
 * This is a genuine architectural improvement, not a workaround:
 *
 * - Atomicity: the database function executes both inserts as one
 *   transaction. If either fails, both roll back - guaranteed by
 *   Postgres itself, not approximated by application code.
 * - Security: the function derives the owner from auth.uid() inside
 *   the database, never trusting client input for identity. The
 *   `ownerId` parameter below is therefore no longer actually used -
 *   it is accepted (for now) only to avoid changing this function's
 *   public signature and the call site in workspaceActions.ts. This
 *   is a deliberate, minimal-footprint choice for this fix; a future
 *   cleanup pass should remove this now-vestigial parameter from both
 *   this function and its caller together.
 *
 * See migration 013_workspace_bootstrap_function.sql for the full
 * architectural rationale (RLS bootstrap circular dependency between
 * workspaces and workspace_members).
 */
export async function createWorkspace(
  name: string,
  _ownerId: string
): Promise<RepositoryResult<Workspace>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .rpc('create_workspace_with_owner', { p_name: name })
    .select(WORKSPACE_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data as Workspace, error: null }
}

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