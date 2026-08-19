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
  business_product_type: string | null
  price: string | null
  product_url: string | null
}

export interface RepositoryResult<T> {
  data: T | null
  error: string | null
}

const PRODUCT_COLUMNS =
  'id, workspace_id, brand_id, brain_run_id, product_type, status, product_structure, package_definition, decision_record, created_at, updated_at, business_product_type, price, product_url'

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
 * Updates a product's structured/decision fields.
 *
 * admins_can_update_products RLS policy was directly confirmed
 * present on remote during the Product Truth + Master Product Asset
 * V1 slice - the comment previously here describing this as a known
 * gap was stale documentation, not current reality.
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
 * Product Truth + Master Product Asset V1 slice addition. Updates
 * the three new Product Truth fields - businessProductType, price,
 * productUrl. All are genuinely new facts (confirmed by direct
 * inspection: none existed anywhere in this schema before this
 * slice) - customer-supplied, never inferred or fabricated.
 */
export async function updateProductTruthFields(
  productId: string,
  updates: Partial<{ business_product_type: string; price: string; product_url: string }>
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
 * Permanently deletes a product.
 */
export async function deleteProduct(productId: string): Promise<RepositoryResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', productId)

  if (error) {
    return { data: null, error: error.message }
  }
  return { data: null, error: null }
}
