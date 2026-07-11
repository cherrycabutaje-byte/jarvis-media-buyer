import { claudeAdapter } from "@/lib/providers/claudeAdapter"
import { mockImageProvider } from "@/lib/providers/mockImageProvider"
import type { TextProviderAdapter, ImageProviderAdapter } from "@/lib/providers/types"

/**
 * Provider registry and resolver.
 *
 * SLICE 5 UPDATE: resolveTextProvider() now returns the real
 * claudeAdapter instead of mockTextProvider. This is a TEMPORARY
 * implementation strategy, not the long-term provider selection
 * mechanism - per explicit instruction, this in-code registry
 * remains the deliberate stand-in until providers/provider_models
 * are genuinely seeded and a real database-driven resolution
 * mechanism is built. The Worker is unaffected by this change - it
 * only ever calls resolveTextProvider(), never knowing whether the
 * result is a mock or a real adapter.
 *
 * resolveImageProvider() remains unchanged (still returns
 * mockImageProvider) - image provider integration is out of scope
 * for this slice.
 */
export function resolveTextProvider(): TextProviderAdapter {
  return claudeAdapter
}

export function resolveImageProvider(): ImageProviderAdapter {
  return mockImageProvider
}