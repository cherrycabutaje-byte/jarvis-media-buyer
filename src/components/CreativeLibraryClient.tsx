"use client";
import { useRouter } from "next/navigation";
import CreativeAssetUploader from "@/components/CreativeAssetUploader";
import CreativeLibraryGrid from "@/components/CreativeLibraryGrid";
import type { CreativeAsset } from "@/lib/repositories/creativeAssetRepository";

export default function CreativeLibraryClient({
  workspaceId,
  brandId,
  productId,
  initialAssets,
}: {
  workspaceId: string;
  brandId: string | null;
  productId: string | null;
  initialAssets: CreativeAsset[];
}) {
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <CreativeAssetUploader
        workspaceId={workspaceId}
        brandId={brandId}
        productId={productId}
        onUploaded={() => router.refresh()}
      />
      <CreativeLibraryGrid initialAssets={initialAssets} />
    </div>
  );
}