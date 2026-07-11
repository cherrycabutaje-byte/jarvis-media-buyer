import type { TextProviderAdapter, TextProviderResult } from "@/lib/providers/types"
import type { ProviderPrompt } from "@/lib/jarvis-brain/types"

/**
 * Real Provider Adapter for Claude (Anthropic Messages API).
 *
 * Implements the existing, frozen TextProviderAdapter interface
 * (Slice 4) - no interface changes. This is the ONLY concrete
 * implementation change in Slice 5; the Worker and the interface
 * itself are both untouched.
 *
 * Configuration:
 * - ANTHROPIC_API_KEY - read directly from process.env. No database,
 *   no platform_provider_credentials, no encryption - explicitly
 *   deferred per instruction.
 * - ANTHROPIC_MODEL - read from process.env; if absent, falls back to
 *   a clearly documented default. This keeps the model choice
 *   swappable via environment configuration now, and trivially
 *   replaceable by a future provider_models table lookup later,
 *   without changing this call site's shape.
 *
 * Field mapping is deliberately defensive rather than assumed: the
 * real Anthropic Messages API response is inspected at runtime
 * (temporary raw-response logging included below, to be removed
 * once the real shape is confirmed against a live call) rather than
 * trusting a remembered shape. usage is only populated if the API
 * response actually includes it - never invented.
 */

// Documented default per current model information. Confirm/override
// via ANTHROPIC_MODEL if this should differ.
const DEFAULT_MODEL = "claude-sonnet-5"

export const claudeAdapter: TextProviderAdapter = {
  providerName: "claude-adapter",
  async execute(prompt: ProviderPrompt): Promise<TextProviderResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL

    if (!apiKey) {
      return {
        providerName: "claude-adapter",
        rawText: "",
        finishReason: "error",
        retryable: false,
        providerMetadata: { provider: "claude-adapter", model, error: "ANTHROPIC_API_KEY is not set" },
      }
    }

    let response: Response
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system: prompt.systemPrompt,
          messages: [{ role: "user", content: prompt.userPrompt }],
        }),
      })
    } catch (err) {
      return {
        providerName: "claude-adapter",
        rawText: "",
        finishReason: "error",
        retryable: true,
        providerMetadata: {
          provider: "claude-adapter",
          model,
          error: err instanceof Error ? err.message : String(err),
        },
      }
    }

    const rawBody = await response.text()
    // TEMPORARY DIAGNOSTIC - to be removed once the real response
    // shape is confirmed. Logs the raw Anthropic response so the
    // actual field names can be verified against real evidence
    // rather than assumed.
    console.log("[claudeAdapter] raw response:", rawBody)

    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return {
        providerName: "claude-adapter",
        rawText: "",
        finishReason: "error",
        retryable: response.status >= 500,
        providerMetadata: { provider: "claude-adapter", model, error: "Failed to parse response body as JSON" },
      }
    }

    if (!response.ok) {
      const body = parsed as { error?: { message?: string; type?: string } }
      return {
        providerName: "claude-adapter",
        rawText: "",
        finishReason: "error",
        retryable: response.status >= 500 || response.status === 429,
        providerMetadata: {
          provider: "claude-adapter",
          model,
          httpStatus: response.status,
          error: body?.error?.message ?? "Unknown error",
        },
      }
    }

    const body = parsed as {
      content?: Array<{ type?: string; text?: string }>
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    const textBlock = Array.isArray(body.content) ? body.content.find((b) => b.type === "text") : undefined
    const rawText = textBlock?.text ?? ""

    let finishReason: TextProviderResult["finishReason"] = "complete"
    if (body.stop_reason === "max_tokens") {
      finishReason = "truncated"
    } else if (body.stop_reason === "refusal") {
      finishReason = "filtered"
    }

    const usage =
      typeof body.usage?.input_tokens === "number" && typeof body.usage?.output_tokens === "number"
        ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens }
        : undefined

    return {
      providerName: "claude-adapter",
      rawText,
      finishReason,
      retryable: false,
      usage,
      providerMetadata: {
        provider: "claude-adapter",
        model,
        stopReason: body.stop_reason,
      },
    }
  },
}