import { definePackage } from "@/lib/jarvis-brain/packageDefinitionEngine"
import type {
  IntelligenceModuleResult,
  ProductStructureObject,
  PackageDefinitionObject,
} from "@/lib/jarvis-brain/types"

/**
 * Runs Module 12 (Package Definition Engine) against Module 11's
 * (Product Structure Engine) output.
 *
 * Pure and deterministic, matching runProductStructureEngine()'s
 * discipline exactly: no Supabase, no repository, no persistence, no
 * AI provider calls. Unlike modules 1-10, definePackage() takes only
 * a single input - the productStructure result - not an accumulating
 * chain of prior module results, confirmed directly against the real
 * function signature rather than assumed.
 *
 * Persistence remains out of scope for this slice.
 */
export function runPackageDefinitionEngine(
  productStructure: IntelligenceModuleResult<ProductStructureObject>
): IntelligenceModuleResult<PackageDefinitionObject> {
  return definePackage(productStructure)
}