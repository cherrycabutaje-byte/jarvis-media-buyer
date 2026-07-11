"use server"

import { createClient } from "@/lib/supabase/server"
import { createProduct, type Product } from "@/lib/repositories/productRepository"

export interface CreateProductResult {
  success: boolean
  data: Product | null
  error: string | null
}

/**
 * Server Action: creates a product on behalf of the currently
 * authenticated user.
 *
 * Resumes the previously deferred Create Product vertical slice, now
 * that both its blockers are resolved: a real brain_run can be
 * created (Vertical Slice #3), and the products UPDATE RLS gap is
 * fixed (Slice 1) - though this action itself only needs INSERT,
 * which was already correctly permitted via admins_can_create_products
 * (migration 003).
 *
 * Delegates entirely to the existing, frozen ProductRepository - no
 * repository logic duplicated or reimplemented here. This creates a
 * product with product_structure, package_definition, and
 * decision_record all NULL - the Builder Layer (a future phase) is
 * responsible for populating those, not this action.
 */
export async function createProductAction(
  workspaceId: string,
  brandId: string,
  brainRunId: string,
  productType: string
): Promise<CreateProductResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to create a product." }
  }

  if (!workspaceId) {
    return { success: false, data: null, error: "A workspace is required." }
  }

  if (!brandId) {
    return { success: false, data: null, error: "A brand is required." }
  }

  if (!brainRunId) {
    return { success: false, data: null, error: "A brain run is required to create a product." }
  }

  if (!productType) {
    return { success: false, data: null, error: "A product type is required." }
  }

  const result = await createProduct(workspaceId, brandId, brainRunId, productType)

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}