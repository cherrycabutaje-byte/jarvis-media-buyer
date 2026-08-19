"use server"

import { createClient } from "@/lib/supabase/server"
import { getProductById, updateProductTruthFields } from "@/lib/repositories/productRepository"
import { getBrandById } from "@/lib/repositories/brandRepository"
import { getBrainRunById } from "@/lib/repositories/brainRunRepository"
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository"
import { buildProductTruthProfile, type ProductTruthProfile, type BusinessProductType } from "@/lib/product/productTruth"

export interface GetProductTruthResult {
  success: boolean
  error: string | null
  profile: ProductTruthProfile | null
}

/**
 * Product Truth + Master Product Asset V1 slice.
 *
 * Assembles the real ProductTruthProfile for a product from data
 * JARVIS already has - reads brain_runs.business_input directly
 * (never duplicated), businessIntelligence/offerIntelligence/
 * audienceIntelligence from the same already-computed
 * intelligence_pipeline used throughout this project, and real
 * creative_assets. Zero AI calls.
 */
export async function getProductTruthAction(productId: string): Promise<GetProductTruthResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in.", profile: null }
  }

  const productResult = await getProductById(productId)
  if (productResult.error || !productResult.data) {
    return { success: false, error: productResult.error ?? "Product not found.", profile: null }
  }
  const product = productResult.data

  const brandResult = await getBrandById(product.brand_id)
  const brandName = brandResult.data?.name ?? ""

  let businessInput: { productName?: string; productDescription?: string } | null = null
  let businessIntelligence: { keyDifferentiators: string[] } | null = null
  let offerIntelligence: { offerFrame: string } | null = null
  let audienceIntelligence: { primaryPersona: string } | null = null

  if (product.brain_run_id) {
    const brainRunResult = await getBrainRunById(product.brain_run_id)
    if (brainRunResult.data) {
      businessInput = brainRunResult.data.business_input as { productName?: string; productDescription?: string }
      const pipeline = brainRunResult.data.intelligence_pipeline as unknown as {
        business?: { findings: { keyDifferentiators: string[] } }
        offer?: { findings: { offerFrame: string } }
        audience?: { findings: { primaryPersona: string } }
      }
      businessIntelligence = pipeline.business?.findings ?? null
      offerIntelligence = pipeline.offer?.findings ?? null
      audienceIntelligence = pipeline.audience?.findings ?? null
    }
  }

  const assetsResult = await getCreativeAssetsForWorkspace(product.workspace_id, product.id)
  const mediaAssets = (assetsResult.data ?? []).map((a) => ({ category: a.category }))

  const profile = buildProductTruthProfile({
    brandName,
    businessInput,
    businessProductType: product.business_product_type,
    price: product.price,
    productUrl: product.product_url,
    businessIntelligence,
    offerIntelligence,
    audienceIntelligence,
    mediaAssets,
  })

  return { success: true, error: null, profile }
}

export interface UpdateProductTruthResult {
  success: boolean
  error: string | null
}

/**
 * Sets the customer-supplied business product type - genuinely new
 * fact, never inferred or fabricated. Uses the human-session server
 * client; RLS is enforced by admins_can_update_products, directly
 * confirmed present on remote before this slice added any code
 * depending on it.
 */
export async function setBusinessProductTypeAction(
  productId: string,
  businessProductType: BusinessProductType
): Promise<UpdateProductTruthResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, error: "You must be logged in." }
  }

  const result = await updateProductTruthFields(productId, { business_product_type: businessProductType })
  if (result.error) {
    return { success: false, error: result.error }
  }
  return { success: true, error: null }
}