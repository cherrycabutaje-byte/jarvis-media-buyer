import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository";
import { getCreativeAssetsForWorkspace } from "@/lib/repositories/creativeAssetRepository";
import CreativeLibraryClient from "@/components/CreativeLibraryClient";

export default async function CreativeLibraryPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const workspacesResult = await getWorkspacesForUser(userData.user.id);
  const workspace = workspacesResult.data?.[0] ?? null;

  if (!workspace) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <p style={{ fontSize: "14px", color: "#94a3b8" }}>Set up a workspace first.</p>
      </div>
    );
  }

  const assetsResult = await getCreativeAssetsForWorkspace(workspace.id);
  const assets = assetsResult.data ?? [];

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "900px" }}>
      <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none", display: "inline-block", marginBottom: "18px" }}>
        &larr; Back to Media Buyer
      </Link>

      <div style={{ marginBottom: "26px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 8px" }}>Creative Library</h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>
          Product images, logos, videos, and previous creatives JARVIS can reuse.
        </p>
      </div>

      <CreativeLibraryClient
        workspaceId={workspace.id}
        brandId={null}
        productId={null}
        initialAssets={assets}
      />
    </div>
  );
}