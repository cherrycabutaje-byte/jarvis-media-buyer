import { createHash } from "crypto"

/**
 * Computes a deterministic idempotency key for a job, so that
 * re-submitting the same logical request (same product, same job
 * type, same recommended variation) does not create a duplicate
 * job row - jobs.idempotency_key has a unique constraint that will
 * reject a second insert with the same key.
 *
 * Mirrors computeBusinessStateHash's approach (deterministic
 * SHA-256 of canonicalized input) for the same reason: consistent,
 * repeatable hashing rather than ad-hoc string concatenation.
 */
export function computeJobIdempotencyKey(
  productId: string,
  jobType: string,
  variationId: string
): string {
  const json = JSON.stringify({ productId, jobType, variationId })
  return createHash("sha256").update(json).digest("hex")
}