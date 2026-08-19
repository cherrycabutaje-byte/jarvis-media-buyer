/**
 * Product Image Quality Gate V1
 *
 * ARCHITECTURAL NOTE:
 * Pure, deterministic module - NOT computer vision. Uses only
 * metadata already persisted on a creative_assets row (width,
 * height, file size, MIME type) to produce a cheap, honest quality
 * signal. Never claims to assess lighting, background cleanliness,
 * product visibility, or visual attractiveness - none of that
 * evidence exists, and this module does not pretend otherwise.
 */

export type ImageQualityResult = "READY" | "IMPROVEMENT_RECOMMENDED" | "INSUFFICIENT"

export interface ImageQualityAssessment {
  result: ImageQualityResult
  reasons: string[]
}

const MIN_USABLE_DIMENSION = 400
const RECOMMENDED_MIN_DIMENSION = 1000
const MIN_FILE_SIZE_BYTES = 5 * 1024 // below this, likely a corrupt/placeholder file
const MAX_REASONABLE_ASPECT_RATIO = 3.5 // extremely thin/wide images are usually unusable crops

export interface AssessImageQualityInput {
  widthPx: number | null
  heightPx: number | null
  fileSizeBytes: number
  mimeType: string
}

export function assessImageQuality(input: AssessImageQualityInput): ImageQualityAssessment {
  const { widthPx, heightPx, fileSizeBytes, mimeType } = input
  const reasons: string[] = []

  if (!mimeType.startsWith("image/")) {
    return { result: "INSUFFICIENT", reasons: ["File is not an image."] }
  }

  if (widthPx === null || heightPx === null) {
    return { result: "INSUFFICIENT", reasons: ["Image dimensions could not be determined."] }
  }

  if (widthPx < MIN_USABLE_DIMENSION || heightPx < MIN_USABLE_DIMENSION) {
    return {
      result: "INSUFFICIENT",
      reasons: [`Image is smaller than ${MIN_USABLE_DIMENSION}\u00d7${MIN_USABLE_DIMENSION}px, too low-resolution to use.`],
    }
  }

  if (fileSizeBytes < MIN_FILE_SIZE_BYTES) {
    return { result: "INSUFFICIENT", reasons: ["File size is unusually small for an image this size - it may be corrupted."] }
  }

  const aspectRatio = Math.max(widthPx, heightPx) / Math.min(widthPx, heightPx)
  if (aspectRatio > MAX_REASONABLE_ASPECT_RATIO) {
    reasons.push("Image has an unusually extreme aspect ratio.")
  }

  if (widthPx < RECOMMENDED_MIN_DIMENSION || heightPx < RECOMMENDED_MIN_DIMENSION) {
    reasons.push(`Resolution is below the recommended ${RECOMMENDED_MIN_DIMENSION}\u00d7${RECOMMENDED_MIN_DIMENSION}px for the sharpest results.`)
  }

  if (reasons.length > 0) {
    return { result: "IMPROVEMENT_RECOMMENDED", reasons }
  }

  return { result: "READY", reasons: [] }
}
