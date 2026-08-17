"use client";
import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { createCreativeAssetAction } from "@/lib/actions/creativeAssetActions";
import type { CreativeAssetCategory } from "@/lib/repositories/creativeAssetRepository";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB, matches the storage bucket's own limit

const CATEGORY_OPTIONS: { value: CreativeAssetCategory; label: string; accept: string }[] = [
  { value: "product_image", label: "Product image", accept: "image/jpeg,image/png,image/webp,image/gif" },
  { value: "brand_asset", label: "Logo / brand asset", accept: "image/jpeg,image/png,image/webp,image/gif,image/svg+xml" },
  { value: "video", label: "Product video", accept: "video/mp4,video/quicktime,video/webm" },
  { value: "testimonial", label: "Testimonial", accept: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" },
  { value: "previous_creative", label: "Previous creative", accept: "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" },
];

function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot >= 0 ? name.slice(lastDot) : "";
  const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
  const cleanBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return `${cleanBase}${ext}`;
}

function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function getVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/")) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

export default function CreativeAssetUploader({
  workspaceId,
  brandId,
  productId,
  onUploaded,
}: {
  workspaceId: string;
  brandId: string | null;
  productId: string | null;
  onUploaded: () => void;
}) {
  const [category, setCategory] = useState<CreativeAssetCategory>("product_image");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeOption = CATEGORY_OPTIONS.find((o) => o.value === category)!;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError("This file is too large. Please choose a file under 50MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);

    try {
      const supabase = createClient();

      let widthPx: number | null = null;
      let heightPx: number | null = null;
      let durationSeconds: number | null = null;

      if (file.type.startsWith("image/")) {
        const dims = await getImageDimensions(file);
        widthPx = dims?.width ?? null;
        heightPx = dims?.height ?? null;
      } else if (file.type.startsWith("video/")) {
        const meta = await getVideoMetadata(file);
        widthPx = meta?.width ?? null;
        heightPx = meta?.height ?? null;
        durationSeconds = meta?.duration ?? null;
      }

      const safeName = sanitizeFilename(file.name);
      const storagePath = `${workspaceId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("creative-library")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const result = await createCreativeAssetAction({
        workspaceId,
        brandId,
        productId,
        category,
        sourceType: "customer_upload",
        storagePath,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        widthPx,
        heightPx,
        durationSeconds,
      });

      if (!result.success) {
        // Roll back the storage upload if metadata persistence failed,
        // so we never leave an orphaned file with no DB record.
        await supabase.storage.from("creative-library").remove([storagePath]);
        setError(result.error ?? "Something went wrong saving this asset.");
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded();
    } catch {
      setError("Something went wrong. Please try again.");
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px" }}>
      <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 14px" }}>Add to your Creative Library</h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setCategory(opt.value)}
            disabled={uploading}
            style={{
              padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: uploading ? "default" : "pointer",
              fontFamily: "inherit",
              border: category === opt.value ? "1px solid #22d3ee" : "1px solid #1e293b",
              background: category === opt.value ? "rgba(34,211,238,0.1)" : "#080b12",
              color: category === opt.value ? "#22d3ee" : "#94a3b8",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        border: "1px dashed #334155", borderRadius: "10px", padding: "20px",
        cursor: uploading ? "default" : "pointer", background: "#080b12",
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={activeOption.accept}
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <span style={{ fontSize: "13px", fontWeight: 600, color: uploading ? "#475569" : "#94a3b8" }}>
          {uploading ? "Uploading..." : `Choose a ${activeOption.label.toLowerCase()} file`}
        </span>
      </label>

      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", marginTop: "10px", marginBottom: 0 }}>{error}</p>
      )}
    </div>
  );
}