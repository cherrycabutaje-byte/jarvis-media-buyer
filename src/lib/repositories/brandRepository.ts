import { createClient } from '@/lib/supabase/server'

export interface Brand {
  id: string
  workspace_id: string
  name: string
  website: string | null
  brand_context: Record<string, unknown>
  created_at: string
  updated_at: string
  objective: string | null
  target_roas: number | null
  target_cpa_cents: number | null
  monthly_budget_cents: number | null
  daily_maximum_cents: number | null
  max_test_budget_cents: number | null
  budget_currency: string | null
  authority_mode: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const BRAND_COLUMNS =
  'id, workspace_id, name, website, brand_context, created_at, updated_at, objective, target_roas, target_cpa_cents, monthly_budget_cents, daily_maximum_cents, max_test_budget_cents, budget_currency, authority_mode'

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
 * Owner Goals + Budget + Risk Guardrails V1 slice addition.
 *
 * Uses the existing admins_can_update_brands RLS policy (verified
 * present before this slice added any dependent code) - no new
 * authorization primitive, no service-role bypass. Every field is
 * genuinely nullable - callers must not invent a default.
 */
export async function updateOwnerGuardrails(
  brandId: string,
  updates: Partial<
    Pick<
      Brand,
      | 'objective'
      | 'target_roas'
      | 'target_cpa_cents'
      | 'monthly_budget_cents'
      | 'daily_maximum_cents'
      | 'max_test_budget_cents'
      | 'budget_currency'
      | 'authority_mode'
    >
  >
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

export async function deleteBrand(brandId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from('brands').delete().eq('id', brandId)
  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}
