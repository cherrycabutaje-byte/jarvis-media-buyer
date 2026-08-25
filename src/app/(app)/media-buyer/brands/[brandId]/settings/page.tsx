import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBrandById } from "@/lib/repositories/brandRepository";
import { getWorkspacesForUser } from "@/lib/repositories/workspaceRepository";
import OwnerGuardrailsSettings from "@/components/OwnerGuardrailsSettings";
import MetaAdAccountConnection from "@/components/MetaAdAccountConnection";
import MetaAdsSyncSection from "@/components/MetaAdsSyncSection";
import { getMetaAdAccountLinkForBrand } from "@/lib/repositories/metaAdAccountRepository";

export default async function BrandAdvertisingGoalsPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    return null;
  }

  const brandResult = await getBrandById(brandId);

  if (brandResult.error || !brandResult.data) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Business not found</h1>
      </div>
    );
  }
  const brand = brandResult.data;

  const workspacesResult = await getWorkspacesForUser(userData.user.id);
  const isMember = workspacesResult.data?.some((w) => w.id === brand.workspace_id);
  if (!isMember) {
    return (
      <div style={{ padding: "32px 28px", maxWidth: "600px" }}>
        <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none" }}>&larr; Back to Media Buyer</Link>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 8px" }}>Not found</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: "760px" }}>
      <Link href="/media-buyer" style={{ fontSize: "13px", color: "#22d3ee", textDecoration: "none", display: "inline-block", marginBottom: "18px" }}>
        &larr; Back to Media Buyer
      </Link>

      <div style={{ marginBottom: "26px" }}>
        <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 6px" }}>
          {brand.name}
        </p>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Advertising Goals & Budget</h1>
      </div>

      <OwnerGuardrailsSettings
        key={JSON.stringify([brand.objective, brand.target_roas, brand.target_cpa_cents, brand.monthly_budget_cents, brand.daily_maximum_cents, brand.max_test_budget_cents, brand.budget_currency, brand.authority_mode])}
        brandId={brand.id}
        initial={{
          objective: brand.objective,
          targetRoas: brand.target_roas,
          targetCpaCents: brand.target_cpa_cents,
          monthlyBudgetCents: brand.monthly_budget_cents,
          dailyMaximumCents: brand.daily_maximum_cents,
          maxTestBudgetCents: brand.max_test_budget_cents,
          budgetCurrency: brand.budget_currency,
          authorityMode: brand.authority_mode,
        }}
      />

      <MetaAdAccountConnectionSection brandId={brand.id} />
    </div>
  );
}

async function MetaAdAccountConnectionSection({ brandId }: { brandId: string }) {
  const linkResult = await getMetaAdAccountLinkForBrand(brandId);
  const link = linkResult.data;
  return (
    <>
      <MetaAdAccountConnection
        brandId={brandId}
        connected={!!link && link.status === "connected"}
        metaAdAccountId={link?.meta_ad_account_id ?? null}
        status={link?.status ?? null}
        lastSyncedAt={link?.last_synced_at ?? null}
      />
      {link && link.status === "connected" && <MetaAdsSyncSection brandId={brandId} />}
    </>
  );
}
