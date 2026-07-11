"use server"

import { createClient } from "@/lib/supabase/server"
import { getBrainRunById } from "@/lib/repositories/brainRunRepository"
import { getProductById, updateProduct, type Product } from "@/lib/repositories/productRepository"
import { runProductStructureEngine } from "@/lib/builder/runProductStructureEngine"
import { runPackageDefinitionEngine } from "@/lib/builder/runPackageDefinitionEngine"
import { runDecisionEngine } from "@/lib/builder/runDecisionEngine"
import type { BrainPipelineOutput } from "@/lib/brain/runBrainPipeline"

export interface RunBuilderAndPersistResult {
  success: boolean
  data: Product | null
  error: string | null
}

/**
 * Server Action: runs the already-validated Builder chain (Modules
 * 11, 12, 13) against the product's actual recorded brain_run, and
 * persists the three results onto the existing products row.
 *
 * Executes NO new business logic - this only orchestrates the
 * already-frozen, already-validated pure functions from Slices 3A/
 * 3B/3C, then writes their output via the existing, frozen
 * ProductRepository.updateProduct(), which already restricts writes
 * to exactly product_structure, package_definition, and
 * decision_record.
 *
 * Uses product.brain_run_id via the newly added getBrainRunById() -
 * not getCurrentBrainRunForBrand() - so persistence stays correctly
 * tied to the specific analysis this product was actually built
 * from, not whichever run currently happens to be the brand's
 * newest one.
 */
export async function runBuilderAndPersistAction(
  productId: string
): Promise<RunBuilderAndPersistResult> {
  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { success: false, data: null, error: "You must be logged in to run the Builder Layer." }
  }

  if (!productId) {
    return { success: false, data: null, error: "A product is required." }
  }

  const productResult = await getProductById(productId)
  if (productResult.error || !productResult.data) {
    return { success: false, data: null, error: productResult.error ?? "Product not found." }
  }
  const product = productResult.data

  const brainRunResult = await getBrainRunById(product.brain_run_id)
  if (brainRunResult.error || !brainRunResult.data) {
    return { success: false, data: null, error: brainRunResult.error ?? "Brain run not found." }
  }

  const pipeline = brainRunResult.data.intelligence_pipeline as unknown as BrainPipelineOutput

  let productStructureResult
  let packageDefinitionResult
  let decisionRecordResult
  try {
    productStructureResult = runProductStructureEngine(pipeline)
    packageDefinitionResult = runPackageDefinitionEngine(productStructureResult)
    decisionRecordResult = runDecisionEngine(pipeline, productStructureResult, packageDefinitionResult)
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : "The Builder pipeline failed to execute.",
    }
  }

  const result = await updateProduct(productId, {
    product_structure: productStructureResult as unknown as Record<string, unknown>,
    package_definition: packageDefinitionResult as unknown as Record<string, unknown>,
    decision_record: decisionRecordResult as unknown as Record<string, unknown>,
  })

  if (result.error) {
    return { success: false, data: null, error: result.error }
  }

  return { success: true, data: result.data, error: null }
}