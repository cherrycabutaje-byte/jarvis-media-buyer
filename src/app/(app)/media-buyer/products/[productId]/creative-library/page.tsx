import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/lib/repositories/productRepository";
import { getBrandById } from "@/lib/repositories/brandRepository";
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository";
import CreativeLibraryClient from "@/components/CreativeLibraryClient";
import BusinessProductTypeSelector from "@/components/BusinessProductTypeSelector";
import { assessImageQuality } from "@/lib/product/imageQualityGate";
import type { BusinessProductType } from "@/lib/product/productTruth";

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

const BUSINESS_TYPE_LABELS: Record<BusinessProductType, string> = {
  PHYSICAL_PRODUCT: "Physical product",
  SERVICE: "Service",
  SAAS_APP: "Software / App",
  DIGITAL_PRODUCT: "Digital product",
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

  const businessProductType =
    product.business_product_type &&
    ["PHYSICAL_PRODUCT", "SERVICE", "SAAS_APP", "DIGITAL_PRODUCT"].includes(product.business_product_type)
      ? (product.business_product_type as BusinessProductType)
      : null;

  const assetsResult = await getCreativeAssetsForWorkspace(product.workspace_id, product.id);
  const assets = assetsResult.data ?? [];

  const masterAsset = assets.find((a) => a.is_master) ?? null;
  const eligiblePhotos = assets.filter((a) => a.category === "product_image" || a.category === "product_in_use");

  let mediaStatusLabel = "No product photo yet";
  let mediaStatusColor = "#64748b";
  if (masterAsset) {
    const q = assessImageQuality({
      widthPx: masterAsset.width_px,
      heightPx: masterAsset.height_px,
      fileSizeBytes: masterAsset.file_size_bytes,
      mimeType: masterAsset.mime_type,
    });
    if (q.result === "READY") {
      mediaStatusLabel = "Ready";
      mediaStatusColor = "#4ade80";
    } else if (q.result === "IMPROVEMENT_RECOMMENDED") {
      mediaStatusLabel = "Improvement recommended";
      mediaStatusColor = "#facc15";
    } else {
      mediaStatusLabel = "Insufficient";
      mediaStatusColor = "#f87171";
    }
  } else if (eligiblePhotos.length > 0) {
    mediaStatusLabel = "Photo available - not yet set as master";
    mediaStatusColor = "#facc15";
  }

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

      {!businessProductType ? (
        <div style={{ marginBottom: "20px" }}>
          <BusinessProductTypeSelector productId={product.id} />
        </div>
      ) : (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px",
        }}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "14px 18px", flex: "1 1 200px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Product type</p>
            <p style={{ fontSize: "14px", color: "#e2e8f0", margin: 0, fontWeight: 600 }}>{BUSINESS_TYPE_LABELS[businessProductType]}</p>
          </div>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "14px 18px", flex: "1 1 200px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Product media</p>
            <p style={{ fontSize: "14px", color: mediaStatusColor, margin: 0, fontWeight: 600 }}>{mediaStatusLabel}</p>
          </div>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px", padding: "14px 18px", flex: "1 1 200px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>Assets on file</p>
            <p style={{ fontSize: "14px", color: "#e2e8f0", margin: 0, fontWeight: 600 }}>{assets.length}</p>
          </div>
        </div>
      )}

      <CreativeLibraryClient
        workspaceId={product.workspace_id}
        brandId={product.brand_id}
        productId={product.id}
        businessProductType={businessProductType}
        initialAssets={assets}
      />

      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <Link href={`/media-buyer/products/${product.id}/creative-plan`} style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#080b12",
          background: "#22d3ee", padding: "10px 18px", borderRadius: "9px", textDecoration: "none",
        }}>
          Plan Creative
        </Link>
      </div>
    </div>
  );
}
