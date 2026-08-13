import type { ProviderPrompt } from "@/lib/jarvis-brain/types"

/**
 * Runtime type guard for ProviderPrompt (Worker Text-Generation
 * Payload Validation slice).
 *
 * Validates the complete runtime contract the Worker and provider
 * adapter actually depend upon - not merely the presence of
 * expectedDeliverables (the field that happened to crash first).
 * Checks every required field's actual runtime type, since
 * ProviderPrompt is a compile-time-only TypeScript interface with
 * no runtime enforcement anywhere else in this project.
 *
 * Uses a type-predicate return (payload is ProviderPrompt) so a
 * caller who checks `if (!validateProviderPrompt(x)) { return }`
 * gets `x` naturally narrowed to ProviderPrompt afterward - no
 * separate type assertion is needed or should be used to bypass
 * this boundary.
 *
 * Metadata field runtime types (variationId, productType,
 * assetType) are confirmed directly from the real ProviderPrompt
 * interface (src/lib/jarvis-brain/types.ts) - all three are plain
 * `string`, not assumed.
 */
export function validateProviderPrompt(payload: unknown): payload is ProviderPrompt {
  if (typeof payload !== "object" || payload === null) return false
  const p = payload as Record<string, unknown>

  if (typeof p.systemPrompt !== "string") return false
  if (typeof p.userPrompt !== "string") return false
  if (typeof p.outputFormat !== "string") return false

  if (!Array.isArray(p.constraints)) return false
  if (!p.constraints.every((c) => typeof c === "string")) return false

  if (typeof p.variables !== "object" || p.variables === null) return false
  if (!Object.values(p.variables as Record<string, unknown>).every((v) => typeof v === "string")) return false

  if (typeof p.language !== "string") return false

  if (!Array.isArray(p.expectedDeliverables)) return false
  if (!p.expectedDeliverables.every((d) => typeof d === "string")) return false

  if (typeof p.metadata !== "object" || p.metadata === null) return false
  const m = p.metadata as Record<string, unknown>
  if (typeof m.variationId !== "string") return false
  if (typeof m.productType !== "string") return false
  if (typeof m.assetType !== "string") return false

  return true
}