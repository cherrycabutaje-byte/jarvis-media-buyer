import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/lib/repositories/productRepository";
import { getBrandById } from "@/lib/repositories/brandRepository";
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository";
import CreativeLibraryClient from "@/components/CreativeLibraryClient";

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  "static-advertisement": "Static ad",
  "video-advertisement": "Video ad",
  "carousel-advertisement": "Carousel ad",
  "story-advertisement": "Story ad",
  "landing-page": "Landing page",
  "email-campaign": "Email campaign",
  "google-ads": "Google ad",
  "instagram-campaign": "Instagram campaign",
};

export default async function ProductCreativeLibraryPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const productResult = await getProductById(productId);

  if (productResult.error || !productResult.data) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Product not found</h1>
      </div>
    );
  }
  const product = productResult.data;

  const brandResult = await getBrandById(product.brand_id);
  const brand = brandResult.data;
  const productLabel = PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type;

  const assetsResult = await getCreativeAssetsForWorkspace(product.workspace_id, product.id);
  const assets = assetsResult.data ?? [];

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "900px" }}>
      <Link href={`/media-buyer/products/${product.id}`} style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none", display: "inline-block", marginBottom: "18px" }}>
        &larr; Back to {productLabel}
      </Link>

      <div style={{ marginBottom: "26px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>
          {brand?.name ?? "Your business"}
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>Creative Assets</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
          Reusable material JARVIS has for {productLabel}.
        </p>
      </div>

      <CreativeLibraryClient
        workspaceId={product.workspace_id}
        brandId={product.brand_id}
        productId={product.id}
        initialAssets={assets}
      />
    </div>
  );
}