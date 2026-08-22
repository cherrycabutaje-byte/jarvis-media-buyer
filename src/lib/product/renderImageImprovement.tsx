import { ImageResponse } from "next/og"

/**
 * Renders a deterministic image improvement (downscale or safe-fit
 * onto a standard canvas) using next/og's ImageResponse - the exact
 * same zero-new-dependency mechanism already proven in
 * renderStaticCreative.ts (satori + resvg internally, a
 * deterministic rasterization pipeline, not an AI model).
 *
 * objectFit: "contain" preserves the full source image without
 * cropping or stretching (Step 9's explicit brand-safety
 * requirement) - this single operation correctly handles both
 * "downscale an oversized image" and "fit an extreme aspect ratio
 * onto a standard canvas", since both are really the same
 * operation: fit the source into a target square without
 * distortion.
 *
 * Transparency: when the source is a PNG, the canvas background is
 * left transparent so any existing alpha channel is preserved
 * rather than flattened onto an opaque fill.
 */
export interface RenderDeterministicImprovementInput {
  sourceUrl: string
  targetMaxDimension: number
  preserveTransparency: boolean
}

export async function renderDeterministicImprovement(input: RenderDeterministicImprovementInput): Promise<ArrayBuffer> {
  const { sourceUrl, targetMaxDimension, preserveTransparency } = input

  const jsx = (
    <div
      style={{
        width: `${targetMaxDimension}px`,
        height: `${targetMaxDimension}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: preserveTransparency ? "transparent" : "#ffffff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sourceUrl}
        alt=""
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  )

  const imageResponse = new ImageResponse(jsx, {
    width: targetMaxDimension,
    height: targetMaxDimension,
  })

  return await imageResponse.arrayBuffer()
}
