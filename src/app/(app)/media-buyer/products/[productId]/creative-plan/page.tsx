import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/lib/repositories/productRepository";
import { getBrandById } from "@/lib/repositories/brandRepository";
import { getBrainRunById } from "@/lib/repositories/brainRunRepository";
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository";
import {
  decideCreativeProductionMethod,
  parseCreativeRequirement,
  type CreativeAssetEvidence,
  type HybridDecisionResult,
} from "@/lib/hybrid/hybridCreativeDecisionEngine";

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

const DECISION_LABELS: Record<string, string> = {
  REUSE: "Reuse existing material",
  REDESIGN: "Redesign existing material",
  REMIX: "Remix existing components",
  PARTIAL_GENERATION: "Partial generation",
  FULL_GENERATION: "Full generation",
};

const COST_LABELS: Record<string, { label: string; color: string }> = {
  VERY_LOW: { label: "Very low", color: "#4ade80" },
  LOW: { label: "Low", color: "#4ade80" },
  MEDIUM: { label: "Medium", color: "#facc15" },
  HIGH: { label: "High", color: "#fb923c" },
  VERY_HIGH: { label: "Very high", color: "#f87171" },
};

function DecisionBadge({ decision }: { decision: string }) {
  const colors: Record<string, string> = {
    REUSE: "#4ade80",
    REDESIGN: "#4ade80",
    REMIX: "#22d3ee",
    PARTIAL_GENERATION: "#facc15",
    FULL_GENERATION: "#f87171",
  };
  const color = colors[decision] ?? "#94a3b8";
  return (
    <span style={{
      display: "inline-block", fontSize: "13px", fontWeight: 800, color, background: `${color}1a`,
      padding: "6px 14px", borderRadius: "999px", letterSpacing: "0.02em",
    }}>
      {DECISION_LABELS[decision] ?? decision}
    </span>
  );
}

export default async function CreativePlanPage({
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

  if (!product.brain_run_id) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href={`/media-buyer/products/${product.id}`} style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to {productLabel}</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Creative plan not available yet</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>This product isn&apos;t linked to a completed analysis yet.</p>
      </div>
    );
  }

  const brainRunResult = await getBrainRunById(product.brain_run_id);
  if (brainRunResult.error || !brainRunResult.data) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href={`/media-buyer/products/${product.id}`} style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to {productLabel}</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Analysis unavailable</h1>
      </div>
    );
  }

  const pipeline = brainRunResult.data.intelligence_pipeline as unknown as {
    creativeStrategy?: {
      status: "complete" | "partial" | "unknown";
      confidence: number;
      findings: { creativeAngle: string; visualDirection: string; formatRecommendations: { assetType?: string } };
    };
  };

  if (!pipeline.creativeStrategy) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href={`/media-buyer/products/${product.id}`} style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to {productLabel}</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Creative strategy not available</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>This product&apos;s analysis is missing creative strategy data.</p>
      </div>
    );
  }

  const requirement = parseCreativeRequirement(pipeline.creativeStrategy);

  const assetsResult = await getCreativeAssetsForWorkspace(product.workspace_id);
  const rawAssets = assetsResult.data ?? [];
  const evidence: CreativeAssetEvidence[] = rawAssets.map((a) => ({
    id: a.id,
    category: a.category,
    sourceType: a.source_type,
    mimeType: a.mime_type,
    widthPx: a.width_px,
    heightPx: a.height_px,
    durationSeconds: a.duration_seconds,
    productId: a.product_id,
    brandId: a.brand_id,
    workspaceId: a.workspace_id,
    originalFilename: a.original_filename,
    createdAt: a.created_at,
  }));

  const decision: HybridDecisionResult = decideCreativeProductionMethod(requirement, evidence, {
    workspaceId: product.workspace_id,
    productId: product.id,
    brandId: product.brand_id,
  });

  const selectedAssets = evidence.filter((a) => decision.selectedAssetIds.includes(a.id));
  const costInfo = COST_LABELS[decision.relativeCost] ?? { label: decision.relativeCost, color: "#94a3b8" };

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "760px" }}>
      <Link href={`/media-buyer/products/${product.id}/creative-library`} style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none", display: "inline-block", marginBottom: "18px" }}>
        &larr; Back to Creative Assets
      </Link>

      <div style={{ marginBottom: "26px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>
          {brand?.name ?? "Your business"}
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 12px" }}>JARVIS Creative Plan</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>For {productLabel}</p>
      </div>

      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "26px", marginBottom: "16px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>
          Recommended production method
        </p>
        <div style={{ marginBottom: "16px" }}>
          <DecisionBadge decision={decision.decision} />
        </div>
        <p style={{ fontSize: "15px", color: "#e2e8f0", lineHeight: 1.6, margin: 0 }}>{decision.reason}</p>
      </div>

      {selectedAssets.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "22px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Existing assets JARVIS intends to use
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {selectedAssets.map((a) => (
              <div key={a.id} style={{
                padding: "10px 14px", background: "#080b12", border: "1px solid #1e293b", borderRadius: "9px",
                fontSize: "13px", color: "#e2e8f0",
              }}>
                {a.category.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        </div>
      )}

      {decision.missingComponents.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "22px", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#facc15", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
            What&apos;s missing
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {decision.missingComponents.map((m, i) => (
              <p key={i} style={{ fontSize: "13px", color: "#e2e8f0", margin: 0 }}>&bull; {m}</p>
            ))}
          </div>
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a",
        border: "1px solid #1e293b", borderRadius: "16px", padding: "18px 22px", marginBottom: "16px",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8" }}>Estimated relative production cost</span>
        <span style={{ fontSize: "13px", fontWeight: 800, color: costInfo.color }}>{costInfo.label}</span>
      </div>

      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>Creative production is the next step.</p>
        <span style={{
          display: "inline-block", fontSize: "13px", fontWeight: 700, color: "#475569", background: "#1e293b",
          padding: "10px 18px", borderRadius: "9px",
        }}>
          Produce Creative &mdash; Coming soon
        </span>
      </div>
    </div>
  );
}