"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOwnerGuardrailsAction } from "@/lib/actions/ownerGuardrailsActions";
import type { BusinessObjective, AuthorityMode } from "@/lib/product/ownerGuardrails";

const OBJECTIVE_OPTIONS: { value: BusinessObjective; label: string }[] = [
  { value: "SALES", label: "Sales" },
  { value: "LEADS", label: "Leads" },
  { value: "TRAFFIC", label: "Traffic" },
  { value: "AWARENESS", label: "Awareness" },
];

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP"];

function dollarsToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function centsToDollarsString(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toString();
}

export interface OwnerGuardrailsSettingsProps {
  brandId: string;
  initial: {
    objective: string | null;
    targetRoas: number | null;
    targetCpaCents: number | null;
    monthlyBudgetCents: number | null;
    dailyMaximumCents: number | null;
    maxTestBudgetCents: number | null;
    budgetCurrency: string | null;
    authorityMode: string;
  };
}

export default function OwnerGuardrailsSettings({ brandId, initial }: OwnerGuardrailsSettingsProps) {
  const router = useRouter();
  const [objective, setObjective] = useState<string>(initial.objective ?? "");
  const [targetRoas, setTargetRoas] = useState<string>(initial.targetRoas?.toString() ?? "");
  const [targetCpa, setTargetCpa] = useState<string>(centsToDollarsString(initial.targetCpaCents));
  const [monthlyBudget, setMonthlyBudget] = useState<string>(centsToDollarsString(initial.monthlyBudgetCents));
  const [dailyMaximum, setDailyMaximum] = useState<string>(centsToDollarsString(initial.dailyMaximumCents));
  const [testBudget, setTestBudget] = useState<string>(centsToDollarsString(initial.maxTestBudgetCents));
  const [currency, setCurrency] = useState<string>(initial.budgetCurrency ?? "USD");
  const [authorityMode, setAuthorityMode] = useState<string>(initial.authorityMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await setOwnerGuardrailsAction(brandId, {
      objective: (objective || null) as BusinessObjective | null,
      targetRoas: targetRoas.trim() === "" ? null : Number.parseFloat(targetRoas),
      targetCpaCents: dollarsToCents(targetCpa),
      monthlyBudgetCents: dollarsToCents(monthlyBudget),
      dailyMaximumCents: dollarsToCents(dailyMaximum),
      maxTestBudgetCents: dollarsToCents(testBudget),
      budgetCurrency: currency || null,
      authorityMode: authorityMode as AuthorityMode,
    });

    if (result.success) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong saving these settings.");
    }
    setSaving(false);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #1e293b",
    background: "#080b12", color: "#e2e8f0", fontSize: "14px", fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "12px", fontWeight: 700, color: "#64748b", marginBottom: "6px", display: "block",
  };

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>Advertising goals & budget</h3>
      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px", lineHeight: 1.5 }}>
        JARVIS cannot spend beyond these limits. Nothing here is a suggestion - it is a hard boundary.
      </p>

      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div>
          <label style={labelStyle}>Objective</label>
          <select value={objective} onChange={(e) => setObjective(e.target.value)} style={inputStyle}>
            <option value="">Not set</option>
            {OBJECTIVE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={inputStyle}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Monthly budget</label>
          <input type="number" min="0" step="0.01" value={monthlyBudget} onChange={(e) => setMonthlyBudget(e.target.value)} placeholder="Not set" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Daily maximum</label>
          <input type="number" min="0" step="0.01" value={dailyMaximum} onChange={(e) => setDailyMaximum(e.target.value)} placeholder="Not set" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Maximum test budget</label>
          <input type="number" min="0" step="0.01" value={testBudget} onChange={(e) => setTestBudget(e.target.value)} placeholder="Not set" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Target ROAS (optional)</label>
          <input type="number" min="0" step="0.1" value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} placeholder="Not set" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Target CPA (optional)</label>
          <input type="number" min="0" step="0.01" value={targetCpa} onChange={(e) => setTargetCpa(e.target.value)} placeholder="Not set" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>JARVIS authority mode</label>
          <select value={authorityMode} onChange={(e) => setAuthorityMode(e.target.value)} style={inputStyle}>
            <option value="ADVISOR">Advisor - JARVIS only recommends</option>
            <option value="COPILOT">Copilot (not yet available)</option>
            <option value="AUTOPILOT">Autopilot (not yet available)</option>
          </select>
        </div>
      </div>

      {authorityMode !== "ADVISOR" && (
        <p style={{ fontSize: "12px", color: "#facc15", marginTop: "12px", marginBottom: 0 }}>
          Copilot and Autopilot are not operational yet - JARVIS will continue to act in Advisor-only mode regardless of this setting.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: "20px", fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
          border: "none", borderRadius: "9px", padding: "10px 20px", cursor: saving ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {saving ? "Saving..." : "Save settings"}
      </button>

      {saved && <p style={{ fontSize: "12px", color: "#4ade80", marginTop: "10px", marginBottom: 0 }}>Saved.</p>}
      {error && <p style={{ fontSize: "12px", color: "#f87171", marginTop: "10px", marginBottom: 0 }}>{error}</p>}
    </div>
  );
}
