import type { ProviderPrompt, ImagePromptObject } from "@/lib/jarvis-brain/types"

/**
 * Provider Adapter contracts, matching the shapes already defined in
 * the frozen Component 6 (Provider Adapter Layer) architecture
 * document - not invented fresh for this slice.
 */
export interface TextProviderResult {
  providerName: string
  rawText: string
  finishReason: "complete" | "truncated" | "filtered" | "error"
  retryable: boolean
}

export interface TextProviderAdapter {
  providerName: string
  execute(prompt: ProviderPrompt): Promise<TextProviderResult>
}

export interface ImageProviderResult {
  providerName: string
  imageData: string
  finishReason: "complete" | "filtered" | "error"
  retryable: boolean
}

export interface ImageProviderAdapter {
  providerName: string
  execute(prompt: ImagePromptObject): Promise<ImageProviderResult>
}