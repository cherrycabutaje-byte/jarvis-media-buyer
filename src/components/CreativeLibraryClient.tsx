"use client";
import { useRouter } from "next/navigation";
import CreativeAssetUploader from "@/components/CreativeAssetUploader";
import CreativeLibraryGrid from "@/components/CreativeLibraryGrid";
import type { CreativeAsset } from "@/lib/repositories/creativeAssetRepository";
import type { BusinessProductType } from "@/lib/product/productTruth";

export default function CreativeLibraryClient({
  workspaceId,
  brandId,
  productId,
  businessProductType,
  initialAssets,
}: {
  workspaceId: string;
  brandId: string | null;
  productId: string | null;
  businessProductType?: BusinessProductType | null;
  initialAssets: CreativeAsset[];
}) {
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <CreativeAssetUploader
        workspaceId={workspaceId}
        brandId={brandId}
        productId={productId}
        businessProductType={businessProductType}
        onUploaded={() => router.refresh()}
      />
      <CreativeLibraryGrid initialAssets={initialAssets} productId={productId} />
    </div>
  );
}
