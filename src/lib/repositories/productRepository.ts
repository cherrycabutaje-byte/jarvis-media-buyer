import { createClient } from '@/lib/supabase/server'

export type ProductStatus = 'pending' | 'building' | 'ready' | 'failed'

export interface Product {
  id: string
  workspace_id: string
  brand_id: string
  brain_run_id: string
  product_type: string
  status: ProductStatus
  product_structure: Record<string, unknown> | null
  package_definition: Record<string, unknown> | null
  decision_record: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const PRODUCT_COLUMNS =
  'id, workspace_id, brand_id, brain_run_id, product_type, status, product_structure, package_definition, decision_record, created_at, updated_at'

/**
 * Fetches a single product by id.
 */
export async function getProductById(productId: string): Promise<RepositoryResult<Product>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('id', productId)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Product, error: null }
}

/**
 * Fetches every product belonging to a brand.
 */
export async function getProductsForBrand(brandId: string): Promise<RepositoryResult<Product[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('brand_id', brandId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: (data ?? []) as Product[], error: null }
}

/**
 * Creates a product.
 *
 * Supported by the frozen schema via the existing
 * admins_can_create_products RLS policy (migration 003) - admin+ only.
 */
export async function createProduct(
  workspaceId: string,
  brandId: string,
  brainRunId: string,
  productType: string
): Promise<RepositoryResult<Product>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .insert({
      workspace_id: workspaceId,
      brand_id: brandId,
      brain_run_id: brainRunId,
      product_type: productType,
    })
    .select(PRODUCT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Product, error: null }
}

/**
 * KNOWN SCHEMA/RLS GAP - discovered during Repository Layer
 * implementation, not introduced by this repository:
 *
 * The frozen Identity & Authorization migration (003) defines
 * members_can_view_products (select), admins_can_create_products
 * (insert), and admins_can_delete_products (delete) for the products
 * table - but NO update policy of any kind. This function is
 * implemented correctly against the schema, but Row Level Security
 * will reject this call for every authenticated-role caller
 * (owner/admin/member/viewer alike), since Postgres RLS defaults to
 * deny when no policy matches the attempted action. It will only
 * succeed when invoked through a service-role context that bypasses
 * RLS.
 *
 * This is not something this repository can or should work around -
 * it requires a future, separately-approved migration adding an
 * admins_can_update_products policy. Flagging this now rather than
 * leaving it to be discovered later as a confusing runtime failure.
 */
export async function updateProduct(
  productId: string,
  updates: Partial<Pick<Product, 'product_structure' | 'package_definition' | 'decision_record'>>
): Promise<RepositoryResult<Product>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select(PRODUCT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Product, error: null }
}

/**
 * Updates a product's status.
 *
 * The `status` column and its four values (pending, building, ready,
 * failed) are a genuine, existing part of the frozen schema (migration
 * 001) - this is a real supported concept, not an invented one.
 * However, the same RLS gap documented on updateProduct above applies
 * here too: no update policy currently exists for the products table,
 * so this call will also be rejected by RLS for any authenticated-role
 * caller until a future migration adds one.
 */
export async function updateProductStatus(
  productId: string,
  status: ProductStatus
): Promise<RepositoryResult<Product>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update({ status })
    .eq('id', productId)
    .select(PRODUCT_COLUMNS)
    .single()

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: data as Product, error: null }
}

/**
 * Permanently deletes a product.
 *
 * Supported by the frozen schema via the existing
 * admins_can_delete_products RLS policy (migration 003) - a real hard
 * delete, admin+ only. No soft-delete/archive concept exists for
 * products; none is invented here.
 */
export async function deleteProduct(productId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', productId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}