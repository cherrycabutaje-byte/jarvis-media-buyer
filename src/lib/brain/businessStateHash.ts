import { createHash } from "crypto";
import type { BusinessInput } from "@/lib/jarvis-brain/types";

/**
 * Recursively sorts object keys so that JSON.stringify produces the
 * same output regardless of how the input object's keys happened to
 * be ordered at construction time. Without this, two logically
 * identical BusinessInput objects built in a different field order
 * would hash differently, breaking the cache-key guarantee migration
 * 004's business_state_hash design depends on.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

/**
 * Computes a deterministic hash of a BusinessInput, matching migration
 * 004's business_state_hash cache-key design. Only the BusinessInput
 * is hashed - not the competitors array - matching the original
 * design intent (business_state_hash was described as representing
 * "the business input," and the business_input jsonb column stores
 * exactly that). If competitor changes should ever invalidate the
 * cache too, that would be a deliberate future scope expansion.
 *
 * Uses Node's built-in crypto module (synchronous) rather than the
 * Web Crypto API, since this utility is only ever called server-side
 * (from a Server Action, via BrainRunRepository) - Next.js Server
 * Actions run on the Node.js runtime by default.
 */
export function computeBusinessStateHash(input: BusinessInput): string {
  const canonical = canonicalize(input);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json).digest("hex");
}