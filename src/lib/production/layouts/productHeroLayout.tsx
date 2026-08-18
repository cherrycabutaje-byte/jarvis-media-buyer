/**
 * Product Hero Layout Template V1
 *
 * Deterministic JSX layout consumed by next/og's ImageResponse
 * (satori + resvg internally - a deterministic rasterization
 * pipeline, not an AI model). Accepts content/asset URLs as props
 * rather than hard-coding any specific product, per Step 7's
 * explicit requirement.
 *
 * BRAND SAFETY (Step 9): product image uses objectFit: "cover"
 * (never distorted, aspect ratio preserved via cropping, never
 * stretching). Logo uses objectFit: "contain" inside a fixed-size
 * box (never stretched). No brand colors/fonts are invented - a
 * single neutral, professional dark scrim + cyan accent is used
 * (matching this project's own established brand accent color,
 * not a fabricated brand palette).
 */

export interface ProductHeroLayoutProps {
  width: number
  height: number
  productImageUrl: string | null
  logoUrl: string | null
  headline: string | null
  cta: string | null
}

export function productHeroLayout(props: ProductHeroLayoutProps) {
  const { width, height, productImageUrl, logoUrl, headline, cta } = props

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: "#0f172a",
        fontFamily: "sans-serif",
      }}
    >
      {productImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={productImageUrl}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${width}px`,
            height: `${height}px`,
            objectFit: "cover",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: `${width}px`,
          height: `${Math.round(height * 0.42)}px`,
          display: "flex",
          background: "linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))",
        }}
      />

      {logoUrl && (
        <div
          style={{
            position: "absolute",
            top: `${Math.round(height * 0.045)}px`,
            left: `${Math.round(width * 0.045)}px`,
            width: `${Math.round(width * 0.16)}px`,
            height: `${Math.round(width * 0.16)}px`,
            display: "flex",
            backgroundColor: "rgba(255,255,255,0.92)",
            borderRadius: "12px",
            padding: "10px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: `${Math.round(width * 0.06)}px`,
          right: `${Math.round(width * 0.06)}px`,
          bottom: `${Math.round(height * 0.07)}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {headline && (
          <div
            style={{
              display: "flex",
              fontSize: `${Math.round(width * 0.062)}px`,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.15,
              marginBottom: cta ? `${Math.round(height * 0.03)}px` : "0px",
            }}
          >
            {headline}
          </div>
        )}
        {cta && (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontSize: `${Math.round(width * 0.032)}px`,
              fontWeight: 700,
              color: "#0f172a",
              backgroundColor: "#22d3ee",
              padding: `${Math.round(height * 0.02)}px ${Math.round(width * 0.045)}px`,
              borderRadius: "999px",
            }}
          >
            {cta}
          </div>
        )}
      </div>
    </div>
  )
}