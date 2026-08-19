"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteCreativeAssetAction } from "@/lib/actions/creativeAssetActions";
import { setMasterAssetAction } from "@/lib/actions/masterAssetActions";
import type { CreativeAsset } from "@/lib/repositories/creativeAssetRepository";

const CATEGORY_LABELS: Record<string, string> = {
  product_image: "Product image",
  video: "Video",
  brand_asset: "Logo / brand asset",
  testimonial: "Testimonial",
  previous_creative: "Previous creative",
  product_in_use: "Product in use",
  packaging: "Packaging",
  screenshot: "Screenshot",
};

const MASTER_ELIGIBLE_CATEGORIES = ["product_image", "product_in_use"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreativeLibraryGrid({
  initialAssets,
  productId,
}: {
  initialAssets: CreativeAsset[];
  productId?: string | null;
}) {
  const [prevInitialAssets, setPrevInitialAssets] = useState(initialAssets);
  const [assets, setAssets] = useState(initialAssets);
  if (initialAssets !== prevInitialAssets) {
    setPrevInitialAssets(initialAssets);
    setAssets(initialAssets);
  }

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingMasterId, setSettingMasterId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSignedUrls() {
      const supabase = createClient();
      const entries = await Promise.all(
        assets.map(async (asset) => {
          const { data } = await supabase.storage
            .from("creative-library")
            .createSignedUrl(asset.storage_path, 3600);
          return [asset.id, data?.signedUrl ?? null] as const;
        })
      );
      if (!cancelled) {
        const map: Record<string, string> = {};
        for (const [id, url] of entries) {
          if (url) map[id] = url;
        }
        setPreviewUrls(map);
      }
    }
    if (assets.length > 0) {
      loadSignedUrls();
    }
    return () => {
      cancelled = true;
    };
  }, [assets]);

  async function handleDelete(assetId: string, storagePath: string) {
    setDeletingId(assetId);
    const result = await deleteCreativeAssetAction(assetId);
    if (result.success) {
      const supabase = createClient();
      await supabase.storage.from("creative-library").remove([storagePath]);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    }
    setDeletingId(null);
  }

  async function handleSetMaster(assetId: string) {
    if (!productId) return;
    setSettingMasterId(assetId);
    const result = await setMasterAssetAction(productId, assetId);
    if (result.success) {
      setAssets((prev) => prev.map((a) => ({ ...a, is_master: a.id === assetId })));
    }
    setSettingMasterId(null);
  }

  if (assets.length === 0) {
    return (
      <div style={{
        background: "#0f172a", border: "1px dashed #334155", borderRadius: "14px", padding: "32px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
          Nothing here yet. Upload a product image, logo, or video to get started.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
      {assets.map((asset) => {
        const previewUrl = previewUrls[asset.id];
        const isVideo = asset.mime_type.startsWith("video/");
        const canBeMaster = productId && MASTER_ELIGIBLE_CATEGORIES.includes(asset.category);
        return (
          <div key={asset.id} style={{
            background: "#0f172a", border: asset.is_master ? "1px solid #22d3ee" : "1px solid #1e293b", borderRadius: "12px", overflow: "hidden",
          }}>
            <div style={{ aspectRatio: "1", background: "#080b12", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {asset.is_master && (
                <span style={{
                  position: "absolute", top: "8px", left: "8px", fontSize: "10px", fontWeight: 800, color: "#080b12",
                  background: "#22d3ee", padding: "3px 8px", borderRadius: "999px", letterSpacing: "0.04em", zIndex: 1,
                }}>
                  MASTER
                </span>
              )}
              {previewUrl ? (
                isVideo ? (
                  <video src={previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={asset.original_filename ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )
              ) : (
                <span style={{ fontSize: "11px", color: "#475569" }}>Loading&hellip;</span>
              )}
            </div>
            <div style={{ padding: "10px 12px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#22d3ee", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {CATEGORY_LABELS[asset.category] ?? asset.category}
              </p>
              <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 8px" }}>
                {formatFileSize(asset.file_size_bytes)}
                {asset.width_px && asset.height_px ? ` · ${asset.width_px}\u00d7${asset.height_px}` : ""}
                {asset.duration_seconds ? ` · ${Math.round(asset.duration_seconds)}s` : ""}
              </p>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                {canBeMaster && !asset.is_master && (
                  <button
                    onClick={() => handleSetMaster(asset.id)}
                    disabled={settingMasterId === asset.id}
                    style={{
                      fontSize: "11px", fontWeight: 600, color: "#22d3ee", background: "transparent", border: "none",
                      cursor: settingMasterId === asset.id ? "default" : "pointer", padding: 0, fontFamily: "inherit",
                    }}
                  >
                    {settingMasterId === asset.id ? "Setting..." : "Set as master"}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(asset.id, asset.storage_path)}
                  disabled={deletingId === asset.id}
                  style={{
                    fontSize: "11px", fontWeight: 600, color: "#f87171", background: "transparent", border: "none",
                    cursor: deletingId === asset.id ? "default" : "pointer", padding: 0, fontFamily: "inherit",
                  }}
                >
                  {deletingId === asset.id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
