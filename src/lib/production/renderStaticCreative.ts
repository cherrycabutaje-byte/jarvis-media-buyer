import { ImageResponse } from "next/og"
import { productHeroLayout } from "@/lib/production/layouts/productHeroLayout"
import type { StaticCreativeSpec } from "@/lib/production/staticCreativeProducer"

/**
 * Renders a supported StaticCreativeSpec into real PNG bytes using
 * next/og's ImageResponse (satori + resvg internally, bundled with
 * Next.js - zero new dependencies). This is a deterministic
 * rasterization pipeline, not an AI model - no generative call of
 * any kind occurs here.
 *
 * Server-only. Not a Route Handler - ImageResponse is documented to
 * work as a plain server-side value producer outside HTTP request
 * handling (the same mechanism Next.js's own opengraph-image.tsx
 * files use), so this can be called directly from a Server Action.
 */

export interface RenderStaticCreativeInput {
  spec: StaticCreativeSpec
  productImageSignedUrl: string | null
  logoSignedUrl: string | null
}

export async function renderStaticCreative(input: RenderStaticCreativeInput): Promise<ArrayBuffer> {
  const { spec, productImageSignedUrl, logoSignedUrl } = input

  if (!spec.supported || spec.layoutTemplate !== "product-hero") {
    throw new Error(
      "renderStaticCreative called with an unsupported spec - the caller must check spec.supported before calling this."
    )
  }

  const jsx = productHeroLayout({
    width: spec.width,
    height: spec.height,
    productImageUrl: productImageSignedUrl,
    logoUrl: logoSignedUrl,
    headline: spec.headline,
    cta: spec.cta,
  })

  const imageResponse = new ImageResponse(jsx, {
    width: spec.width,
    height: spec.height,
  })

  return await imageResponse.arrayBuffer()
}