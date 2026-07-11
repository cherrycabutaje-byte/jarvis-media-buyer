import { buildImagePrompt } from "@/lib/jarvis-brain/imagePromptBuilder"
import type {
  IntelligenceModuleResult,
  ImageCreativeBrief,
  ImagePromptObject,
  DecisionRecord,
} from "@/lib/jarvis-brain/types"

/**
 * Runs Module 15 (Image Prompt Builder) against Module 16's enriched
 * ImageCreativeBrief and the Decision Record (Module 13).
 *
 * Takes the ENRICHED brief (Module 16's output), not the baseline one
 * living in the variation package from Module 9 - this dependency
 * was confirmed directly against the real signature, not assumed.
 *
 * Pure and deterministic: no Supabase, no repository, no persistence,
 * no AI provider calls. This is the permanent architectural boundary
 * - any image provider must only ever receive the ImagePromptObject
 * this function returns, never any raw Brain object.
 */
export function runImagePromptBuilder(
  imageCreativeBrief: ImageCreativeBrief,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ImagePromptObject> {
  return buildImagePrompt(imageCreativeBrief, decisionRecord)
}