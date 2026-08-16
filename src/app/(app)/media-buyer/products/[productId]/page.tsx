import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/lib/repositories/productRepository";
import { getBrandById } from "@/lib/repositories/brandRepository";
import { getBrainRunById } from "@/lib/repositories/brainRunRepository";
import ProductIntelligenceClient, { type IntelligenceData } from "@/components/ProductIntelligenceClient";

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

export default async function ProductIntelligencePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return null;
  }

  const productResult = await getProductById(productId);

  if (productResult.error || !productResult.data) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Product not found</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>This product doesn&apos;t exist or you don&apos;t have access to it.</p>
      </div>
    );
  }
  const product = productResult.data;

  const brandResult = await getBrandById(product.brand_id);
  const brand = brandResult.data;

  const productLabel = PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type;

  if (!product.brain_run_id) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Intelligence not available yet</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>This product isn&apos;t linked to a completed analysis yet.</p>
      </div>
    );
  }

  const brainRunResult = await getBrainRunById(product.brain_run_id);

  if (brainRunResult.error || !brainRunResult.data) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Analysis unavailable</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>JARVIS couldn&apos;t retrieve the analysis for this product right now.</p>
      </div>
    );
  }

  const rawPipeline = brainRunResult.data.intelligence_pipeline as Partial<IntelligenceData>;

  if (
    !rawPipeline.audienceIntelligence ||
    !rawPipeline.messagingStrategy ||
    !rawPipeline.creativeStrategy ||
    !rawPipeline.campaignIntelligence
  ) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Analysis incomplete</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>This product&apos;s analysis is missing required intelligence data.</p>
      </div>
    );
  }

  const intelligence: IntelligenceData = {
    audienceIntelligence: rawPipeline.audienceIntelligence,
    messagingStrategy: rawPipeline.messagingStrategy,
    creativeStrategy: rawPipeline.creativeStrategy,
    campaignIntelligence: rawPipeline.campaignIntelligence,
  };

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "760px" }}>
      <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none", display: "inline-block", marginBottom: "18px" }}>
        &larr; Back to Media Buyer
      </Link>

      <div style={{ marginBottom: "26px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>
          {brand?.name ?? "Your business"}
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: 0 }}>{productLabel}</h1>
      </div>

      <ProductIntelligenceClient
        intelligence={intelligence}
        productLabel={productLabel}
      />
    </div>
  );
}