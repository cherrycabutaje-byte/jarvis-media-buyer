import { createClient } from '@/lib/supabase/server'

export interface Brand {
  id: string
  workspace_id: string
  name: string
  website: string | null
  brand_context: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const BRAND_COLUMNS = 'id, workspace_id, name, website, brand_context, created_at, updated_at'

/**
 * Fetches a single brand by id.
 */
export async function getBrandById(brandId: string): Promise<RepositoryResult<Brand>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('id', brandId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Brand, error: null }
}

/**
 * Fetches every brand belonging to a workspace.
 */
export async function getBrandsForWorkspace(workspaceId: string): Promise<RepositoryResult<Brand[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .select(BRAND_COLUMNS)
    .eq('workspace_id', workspaceId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as Brand[], error: null }
}

/**
 * Creates a brand within a workspace.
 *
 * Note: brand creation is subject to the existing enforce_max_brands
 * trigger (migration 004), which checks the workspace's subscription
 * plan limit. If the workspace has no subscription yet, the limit is
 * treated as unbounded (existing, already-tested behavior) - this
 * repository does not duplicate that enforcement, it only surfaces
 * whatever error the trigger raises.
 */
export async function createBrand(
  workspaceId: string,
  name: string,
  website?: string,
  brandContext?: Record<string, unknown>
): Promise<RepositoryResult<Brand>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .insert({
      workspace_id: workspaceId,
      name,
      website: website ?? null,
      brand_context: brandContext ?? {},
    })
    .select(BRAND_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Brand, error: null }
}

/**
 * Updates one or more fields of a brand.
 */
export async function updateBrand(
  brandId: string,
  updates: Partial<Pick<Brand, 'name' | 'website' | 'brand_context'>>
): Promise<RepositoryResult<Brand>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brands')
    .update(updates)
    .eq('id', brandId)
    .select(BRAND_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Brand, error: null }
}

/**
 * Permanently deletes a brand.
 *
 * This is a genuine hard delete, not a soft-delete/archive. It is
 * supported by the frozen schema via the existing
 * admins_can_delete_brands RLS policy (migration 003) - a real SQL
 * DELETE, not an invented behavior.
 *
 * NOT SUPPORTED: soft-delete/archive. The `brands` table (migration
 * 001) has no status, archived_at, or equivalent column - there is no
 * schema-level concept of an archived brand distinct from a deleted
 * one. Only this hard delete is available; implementing a soft-delete
 * concept would require a future, separately-approved migration.
 */
export async function deleteBrand(brandId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from('brands').delete().eq('id', brandId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}