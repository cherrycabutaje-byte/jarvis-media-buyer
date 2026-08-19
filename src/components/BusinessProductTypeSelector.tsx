"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setBusinessProductTypeAction } from "@/lib/actions/productTruthActions";
import type { BusinessProductType } from "@/lib/product/productTruth";

const TYPE_OPTIONS: { value: BusinessProductType; label: string; description: string }[] = [
  { value: "PHYSICAL_PRODUCT", label: "Physical product", description: "Something customers hold, wear, or use" },
  { value: "SERVICE", label: "Service", description: "Something you do or provide, not a physical item" },
  { value: "SAAS_APP", label: "Software / App", description: "An app, platform, or online tool" },
  { value: "DIGITAL_PRODUCT", label: "Digital product", description: "Courses, ebooks, templates, downloads" },
];

export default function BusinessProductTypeSelector({ productId }: { productId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState<BusinessProductType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(type: BusinessProductType) {
    setSaving(type);
    setError(null);
    const result = await setBusinessProductTypeAction(productId, type);
    if (!result.success) {
      setError(result.error ?? "Something went wrong saving this.");
      setSaving(null);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "22px" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 6px" }}>What kind of product is this?</h3>
      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>
        This helps JARVIS know what kind of media to ask for.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            disabled={saving !== null}
            style={{
              textAlign: "left", padding: "14px 16px", borderRadius: "10px", border: "1px solid #1e293b",
              background: "#080b12", cursor: saving !== null ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 4px" }}>
              {saving === opt.value ? "Saving..." : opt.label}
            </p>
            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{opt.description}</p>
          </button>
        ))}
      </div>
      {error && <p style={{ fontSize: "12px", color: "#f87171", marginTop: "12px", marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
