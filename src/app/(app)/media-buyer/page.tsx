import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository";
import { getBrandsForWorkspace } from "@/lib/repositories/brandRepository";
import { getProductsForBrand } from "@/lib/repositories/productRepository";

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

function ProductStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", label: "In progress" },
    building: { bg: "rgba(34,211,238,0.12)", color: "#22d3ee", label: "Building" },
    complete: { bg: "rgba(74,222,128,0.12)", color: "#4ade80", label: "Ready" },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color: s.color, background: s.bg, padding: "3px 9px", borderRadius: "999px" }}>
      {s.label}
    </span>
  );
}

export default async function MediaBuyerHomePage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id);
  const workspace = workspacesResult.data?.[0] ?? null;

  if (!workspace) {
    return (
      <div style={{ padding: "32px 28px 60px", maxWidth: "700px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 10px" }}>Set up your workspace</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", marginBottom: "24px", lineHeight: 1.6 }}>
          You need a workspace before you can start building with Media Buyer.
        </p>
        <Link href="/workspaces/new" style={{
          display: "inline-block", fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
          padding: "10px 18px", borderRadius: "9px", textDecoration: "none",
        }}>
          Create a workspace
        </Link>
      </div>
    );
  }

  const brandsResult = await getBrandsForWorkspace(workspace.id);
  const brands = brandsResult.data ?? [];

  const brandsWithProducts = await Promise.all(
    brands.map(async (brand) => {
      const productsResult = await getProductsForBrand(brand.id);
      return { brand, products: productsResult.data ?? [] };
    })
  );

  const hasAnyBrand = brands.length > 0;

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "980px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>Media Buyer</h1>
        <p style={{ fontSize: "15px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
          Turn your business into advertising, guided by JARVIS.
        </p>
      </div>

      {/* Workflow strip */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "32px", padding: "14px 16px",
        background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
      }}>
        {["Your business", "Your products", "JARVIS intelligence", "Creatives", "Publishing", "Performance"].map((step, i, arr) => (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: i < 3 ? "#94a3b8" : "#475569" }}>{step}</span>
            {i < arr.length - 1 && <span style={{ color: "#334155", fontSize: "12px" }}>&rarr;</span>}
          </div>
        ))}
      </div>

      {!hasAnyBrand ? (
        <div style={{
          background: "#0f172a", border: "1px dashed #334155", borderRadius: "16px", padding: "40px 28px", textAlign: "center",
        }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px" }}>Start your first business</h2>
          <p style={{ fontSize: "14px", color: "#94a3b8", margin: "0 0 20px", maxWidth: "420px", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
            Add a business to begin building products and creatives with JARVIS.
          </p>
          <Link href="/brands/new" style={{
            display: "inline-block", fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
            padding: "10px 18px", borderRadius: "9px", textDecoration: "none",
          }}>
            Add a business
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {brandsWithProducts.map(({ brand, products }) => (
            <div key={brand.id} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{brand.name}</h3>
                <Link href="/products/new" style={{
                  fontSize: "12px", fontWeight: 700, color: "#22d3ee", textDecoration: "none",
                  border: "1px solid #1e293b", padding: "6px 12px", borderRadius: "8px",
                }}>
                  + Add a product
                </Link>
              </div>

              {products.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>No products yet for this business.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {products.map((product) => (
                    <div key={product.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px",
                      background: "#080b12", border: "1px solid #1e293b", borderRadius: "10px",
                    }}>
                      <span style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 600 }}>
                        {PRODUCT_TYPE_LABELS[product.product_type] ?? product.product_type}
                      </span>
                      <ProductStatusBadge status={product.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Coming soon: creatives / publishing / performance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "24px" }}>
        {[
          { title: "Review creatives", desc: "Approve and prepare your ads for publishing.", href: "/assets/review" },
          { title: "Mark ready to publish", desc: "Confirm approved creatives are ready to go live.", href: "/assets/ready" },
          { title: "Performance", desc: "See how your published ads are doing.", href: null },
        ].map((card) => (
          <div key={card.title} style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "18px",
            opacity: card.href ? 1 : 0.6,
          }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px" }}>{card.title}</h4>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.5 }}>{card.desc}</p>
            {card.href ? (
              <Link href={card.href} style={{ fontSize: "12px", fontWeight: 700, color: "#22d3ee", textDecoration: "none" }}>
                Open &rarr;
              </Link>
            ) : (
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#475569", background: "#1e293b", padding: "2px 8px", borderRadius: "999px" }}>
                COMING SOON
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}