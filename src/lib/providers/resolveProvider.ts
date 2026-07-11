import { mockTextProvider } from "@/lib/providers/mockTextProvider"
import { mockImageProvider } from "@/lib/providers/mockImageProvider"
import type { TextProviderAdapter, ImageProviderAdapter } from "@/lib/providers/types"

/**
 * Provider registry and resolver.
 *
 * SCOPE NOTE: this deliberately does NOT query the real providers /
 * default_providers / provider_fallback_order / provider_health
 * tables - confirmed empty (0 rows) during Provider Adapter Layer
 * planning. Routing through those tables is explicitly deferred to
 * the Real Provider Adapter slice, per the approved implementation
 * plan's recommendation to bypass provider-selection tables for the
 * mock-only slices. This in-code registry is the minimal, safe
 * stand-in for that later, real routing logic - what matters for
 * this slice is that the Worker calls resolveTextProvider()/
 * resolveImageProvider() instead of importing a mock provider
 * directly, so it no longer knows *how* selection happens, even
 * though the selection logic itself is currently trivial.
 */
export function resolveTextProvider(): TextProviderAdapter {
  return mockTextProvider
}

export function resolveImageProvider(): ImageProviderAdapter {
  return mockImageProvider
}