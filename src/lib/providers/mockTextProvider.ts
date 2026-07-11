import type { TextProviderAdapter, TextProviderResult } from "@/lib/providers/types"
import type { ProviderPrompt } from "@/lib/jarvis-brain/types"

/**
 * Deterministic mock text provider. No network call, no real AI
 * provider - returns a fixed, realistic-shaped result so the
 * surrounding queue/worker chain can be built and proven correct
 * before any real provider is connected.
 */
export const mockTextProvider: TextProviderAdapter = {
  providerName: "mock-text-provider",
  async execute(prompt: ProviderPrompt): Promise<TextProviderResult> {
    return {
      providerName: "mock-text-provider",
      rawText: `[MOCK OUTPUT] Generated for deliverables: ${prompt.expectedDeliverables.join(", ")}`,
      finishReason: "complete",
      retryable: false,
    }
  },
}