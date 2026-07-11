import type { ImageProviderAdapter, ImageProviderResult } from "@/lib/providers/types"
import type { ImagePromptObject } from "@/lib/jarvis-brain/types"

/**
 * Deterministic mock image provider. No network call, no real AI
 * provider - returns a fixed, realistic-shaped result.
 */
export const mockImageProvider: ImageProviderAdapter = {
  providerName: "mock-image-provider",
  async execute(prompt: ImagePromptObject): Promise<ImageProviderResult> {
    return {
      providerName: "mock-image-provider",
      imageData: `[MOCK IMAGE DATA] style=${prompt.style} quality=${prompt.quality} aspectRatio=${prompt.aspectRatio}`,
      finishReason: "complete",
      retryable: false,
    }
  },
}