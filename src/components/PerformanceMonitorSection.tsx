"use client";
import { useState } from "react";
import { getPerformanceSummaryAction, type PerformanceSummaryResult } from "@/lib/actions/performanceSummaryActions";
import { proposeActionForCandidateAction, listActionProposalsAction, decideActionProposalAction, evaluateExecutionReadinessAction, type CustomerFacingActionProposal } from "@/lib/actions/actionProposalActions";
import { createDraftSpecificationAction, updateDraftSpecificationAction, finalizeSpecificationAction, listAvailableTargetsAction, listAvailableCreativeAssetsAction, decideSpecificationAuthorizationAction, type CustomerFacingSpecification } from "@/lib/actions/actionSpecificationActions";

export interface PerformanceMonitorSectionProps {
  brandId: string;
}

function fmt(value: number | null, decimals = 2): string {
  return value === null ? "-" : value.toFixed(decimals);
}

/**
 * Performance Monitor V1 UI - factual numbers only. Explicitly does
 * NOT show healthy/weak/winning/losing/fatigue/pause/scale/
 * recommendation language, or color-coded good/bad signals.
 */
export default function PerformanceMonitorSection({ brandId }: PerformanceMonitorSectionProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PerformanceSummaryResult | null>(null);
  const [proposals, setProposals] = useState<CustomerFacingActionProposal[]>([]);
  const [proposingCode, setProposingCode] = useState<string | null>(null);
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [executionReadiness, setExecutionReadiness] = useState<Record<string, { status: string; messages: string[] }>>({});
  const [specifications, setSpecifications] = useState<Record<string, CustomerFacingSpecification>>({});
  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Array<{ id: string; category: string; originalFilename: string | null }>>([]);
  const [specMessage, setSpecMessage] = useState<string | null>(null);
  const [authBlockers, setAuthBlockers] = useState<string[]>([]);

  function getPeriods() {
    const today = new Date();
    const currentEnd = today.toISOString().slice(0, 10);
    const currentStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const previousEnd = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const previousStart = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { current: { start: currentStart, end: currentEnd }, previous: { start: previousStart, end: previousEnd } };
  }

  async function handleLoad() {
    setLoading(true);
    const { current, previous } = getPeriods();
    const summary = await getPerformanceSummaryAction(brandId, current, previous);
    setResult(summary);
    setLoading(false);
    await loadProposals();
  }

  async function loadProposals() {
    const list = await listActionProposalsAction(brandId);
    if (list.success && list.proposals) {
      setProposals(list.proposals);
      const approved = list.proposals.filter((p) => p.status === "APPROVED");
      const readinessEntries = await Promise.all(
        approved.map(async (p) => {
          const readiness = await evaluateExecutionReadinessAction(brandId, p.id);
          if (readiness.success && readiness.result) {
            return [p.id, { status: readiness.result.status, messages: readiness.result.reasons.map((r) => r.message) }] as const;
          }
          return null;
        })
      );
      const readinessMap: Record<string, { status: string; messages: string[] }> = {};
      for (const entry of readinessEntries) {
        if (entry) readinessMap[entry[0]] = entry[1];
      }
      setExecutionReadiness(readinessMap);
    }
  }

  async function handlePrepareAction(proposalId: string) {
    setSpecMessage(null);
    const createResult = await createDraftSpecificationAction(brandId, proposalId);
    if (!createResult.success || !createResult.specification) {
      setSpecMessage(createResult.error ?? "Could not prepare this action.");
      return;
    }
    setSpecifications((prev) => ({ ...prev, [proposalId]: createResult.specification! }));

    const [targetsResult, assetsResult] = await Promise.all([listAvailableTargetsAction(brandId), listAvailableCreativeAssetsAction(brandId)]);
    if (targetsResult.success) setAvailableTargets(targetsResult.targetIds);
    if (assetsResult.success) setAvailableAssets(assetsResult.assets);
  }

  async function handleUpdateSpecField(specificationId: string, field: "targetEntityId" | "creativeAssetId" | "proposedSpendCents", value: string | number | null) {
    const updateResult = await updateDraftSpecificationAction(brandId, specificationId, { [field]: value });
    if (updateResult.success && updateResult.specification) {
      setSpecifications((prev) => ({ ...prev, [updateResult.specification!.proposalId]: updateResult.specification! }));
    } else {
      setSpecMessage(updateResult.error ?? "Could not update this field.");
    }
  }

  async function handleFinalizeSpecification(specificationId: string, proposalId: string) {
    const finalizeResult = await finalizeSpecificationAction(brandId, specificationId);
    if (finalizeResult.specification) {
      setSpecifications((prev) => ({ ...prev, [proposalId]: finalizeResult.specification! }));
    }
    if (finalizeResult.readiness && finalizeResult.readiness.status !== "READY") {
      setSpecMessage(finalizeResult.readiness.reasons.map((r) => r.message).join(" "));
    } else if (!finalizeResult.success) {
      setSpecMessage(finalizeResult.error ?? "Could not finalize this specification.");
    } else {
      setSpecMessage(null);
    }
  }

  async function handleAuthorizeDecision(brandIdParam: string, specificationId: string, proposalId: string, decision: "AUTHORIZE" | "DECLINE") {
    setAuthBlockers([]);
    if (decision === "AUTHORIZE") {
      const confirmed = window.confirm(
        "You are authorizing this exact advertising action as shown above.\n\nThis authorization does not itself publish or spend money.\n\nAuthorize?"
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm("Decline this exact action? This does not modify the proposal, spend, target, or creative, and does not touch Meta.");
      if (!confirmed) return;
    }
    const result = await decideSpecificationAuthorizationAction(brandIdParam, specificationId, decision);
    if (result.specification) {
      setSpecifications((prev) => ({ ...prev, [proposalId]: result.specification! }));
    }
    if (!result.success) {
      setSpecMessage(result.error ?? "Could not record your decision.");
      setAuthBlockers(result.blockers ?? []);
    } else {
      setSpecMessage(null);
      setAuthBlockers([]);
    }
  }

  async function handleDecide(proposalId: string, decision: "APPROVE" | "DECLINE") {
    const target = proposals.find((p) => p.id === proposalId);
    let message =
      decision === "APPROVE"
        ? "Approve this proposal? This does not execute anything - it only records your decision for the record."
        : "Decline this proposal? This does not execute anything - it only records your decision for the record.";
    if (decision === "APPROVE" && target?.guardrailDecision === "BLOCKED") {
      message =
        "This proposal exceeds your configured budget limits. Approving it now only records your decision - it does not execute anything or override your budget settings. Approve anyway?";
    }
    const confirmed = window.confirm(message);
    if (!confirmed) return;
    await decideActionProposalAction(brandId, proposalId, decision);
    await loadProposals();
  }

  function guardrailStatusText(decision: string): string {
    if (decision === "ALLOWED") return "Within your configured budget.";
    if (decision === "BLOCKED") return "Exceeds your configured budget limits.";
    if (decision === "INSUFFICIENT_CONFIGURATION") return "Budget check incomplete - configure your budget settings to complete this check.";
    return decision.replace(/_/g, " ").toLowerCase();
  }

  async function handlePropose(candidateCode: string) {
    setProposingCode(candidateCode);
    setProposalMessage(null);
    const { current, previous } = getPeriods();
    const outcome = await proposeActionForCandidateAction(brandId, current, previous, candidateCode);
    if (outcome.success && outcome.proposal) {
      setProposalMessage("Proposal created. See it below for your review.");
      await loadProposals();
    } else {
      setProposalMessage(outcome.error ?? "Could not create a proposal.");
    }
    setProposingCode(null);
  }



  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1e293b" };
  const labelStyle: React.CSSProperties = { fontSize: "13px", color: "#94a3b8" };
  const valueStyle: React.CSSProperties = { fontSize: "13px", color: "#e2e8f0", fontFamily: "monospace" };

  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "24px", marginTop: "16px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>Performance changes (account-level)</h3>
      <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>Diagnosis not performed yet.</p>

      <button
        onClick={handleLoad}
        disabled={loading}
        style={{
          fontSize: "13px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
          border: "none", borderRadius: "9px", padding: "10px 18px", cursor: loading ? "default" : "pointer", fontFamily: "inherit",
        }}
      >
        {loading ? "Loading..." : "Load performance changes"}
      </button>

      {result && !result.success && <p style={{ fontSize: "13px", color: "#f87171", marginTop: "12px" }}>{result.error}</p>}

      {result?.success && (
        <div style={{ marginTop: "16px" }}>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>
            Current: {result.currentPeriod?.start} to {result.currentPeriod?.end}
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>
            Previous: {result.previousPeriod?.start} to {result.previousPeriod?.end}
          </p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px", fontFamily: "monospace" }}>
            Status: {result.monitor?.status}
          </p>

          <div style={rowStyle}>
            <span style={labelStyle}>Spend</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalSpend ?? null)} &rarr; {fmt(result.current?.totalSpend ?? null)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Impressions</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalImpressions ?? null, 0)} &rarr; {fmt(result.current?.totalImpressions ?? null, 0)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Clicks</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalClicks ?? null, 0)} &rarr; {fmt(result.current?.totalClicks ?? null, 0)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>CTR</span>
            <span style={valueStyle}>
              {fmt(result.previous?.averageCtr ?? null)}% &rarr; {fmt(result.current?.averageCtr ?? null)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>CPC</span>
            <span style={valueStyle}>
              {fmt(result.previous?.averageCpc ?? null)} &rarr; {fmt(result.current?.averageCpc ?? null)}
            </span>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={labelStyle}>Results</span>
            <span style={valueStyle}>
              {fmt(result.previous?.totalResults ?? null, 0)} &rarr; {fmt(result.current?.totalResults ?? null, 0)}
            </span>
          </div>

          {result.current?.observationCount === 0 && result.previous?.observationCount === 0 && (
            <p style={{ fontSize: "12px", color: "#facc15", marginTop: "12px" }}>
              No synced observations exist yet for either period. Run &quot;Verify &amp; Sync Advertising Data&quot; above first.
            </p>
          )}

          <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1e293b" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 8px" }}>
              Evidence check
            </p>
            <p style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 12px" }}>
              {result.evidenceLabel}
            </p>
            {result.evidenceSignals?.map((s) => (
              <div key={s.metric} style={{ marginBottom: "10px" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#94a3b8", margin: "0 0 2px" }}>{s.metric}:</p>
                <p style={{ fontSize: "13px", color: s.status === "SUFFICIENT" ? "#94a3b8" : "#facc15", margin: 0 }}>
                  {s.customerExplanation}
                </p>
              </div>
            ))}
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "12px", marginBottom: 0 }}>
              Diagnosis: Not performed yet.
            </p>
          </div>

          {result.diagnosticHypotheses && result.diagnosticHypotheses.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1e293b" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>
                Diagnostic analysis
              </p>
              {result.diagnosticHypotheses.map((h) => (
                <div key={h.label} style={{ marginBottom: "14px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 2px" }}>{h.label}</p>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 6px" }}>Evidence strength: {h.confidenceLabel}</p>
                  {h.supportingEvidenceText.map((line) => (
                    <p key={line} style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 2px" }}>&bull; {line}</p>
                  ))}
                </div>
              ))}
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", margin: "8px 0 2px" }}>Root cause:</p>
              <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                Not yet established. {result.diagnosticNote}
              </p>
            </div>
          )}

          {result.solutionCandidates && result.solutionCandidates.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1e293b" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>
                Possible next steps
              </p>
              {result.solutionCandidates.map((c) => (
                <div key={c.label} style={{ marginBottom: "12px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 2px" }}>{c.label}</p>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>Status: {c.status.replace(/_/g, " ").toLowerCase()}</p>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>{c.rationale}</p>
                  {c.unavailableReason && (
                    <p style={{ fontSize: "12px", color: "#facc15", margin: "4px 0 0" }}>Not currently available: {c.unavailableReason}</p>
                  )}
                  {c.status === "ELIGIBLE" && (
                    <button
                      onClick={() => handlePropose(c.code)}
                      disabled={proposingCode === c.code}
                      style={{
                        fontSize: "12px", fontWeight: 700, color: "#080b12", background: "#22d3ee",
                        border: "none", borderRadius: "8px", padding: "8px 14px", marginTop: "6px",
                        cursor: proposingCode === c.code ? "default" : "pointer", fontFamily: "inherit",
                      }}
                    >
                      {proposingCode === c.code ? "Creating proposal..." : "Propose this experiment"}
                    </button>
                  )}
                </div>
              ))}
              {proposalMessage && <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>{proposalMessage}</p>}
              {result.solutionConstraints && result.solutionConstraints.length > 0 && (
                <div style={{ marginTop: "8px" }}>
                  {result.solutionConstraints.map((note) => (
                    <p key={note} style={{ fontSize: "11px", color: "#64748b", margin: "0 0 4px" }}>{note}</p>
                  ))}
                </div>
              )}
              <p style={{ fontSize: "12px", color: "#64748b", marginTop: "8px", marginBottom: 0 }}>
                No action has been taken. Any next step requires your review and approval.
              </p>
            </div>
          )}

          {proposals.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #1e293b" }}>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>
                Proposals
              </p>
              {proposals.map((p) => (
                <div key={p.id} style={{ marginBottom: "14px", padding: "12px", background: "#080b12", border: "1px solid #1e293b", borderRadius: "10px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 4px" }}>{p.label}</p>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 6px" }}>{p.rationale}</p>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 4px" }}>
                    Proposed spend: {p.proposedSpendCents === null ? "Not set" : (p.proposedSpendCents / 100).toFixed(2)}
                  </p>
                  <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px" }}>
                    Maximum test budget: {p.maxAuthorizedSpendCents === null ? "Not set" : (p.maxAuthorizedSpendCents / 100).toFixed(2)}
                  </p>
                  <p style={{ fontSize: "12px", color: p.guardrailDecision === "BLOCKED" ? "#f87171" : "#64748b", margin: "0 0 8px" }}>
                    Budget check: {guardrailStatusText(p.guardrailDecision)}
                  </p>
                  {p.status === "PENDING_OWNER_REVIEW" ? (
                    <>
                      <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 8px" }}>
                        No action has been taken.
                      </p>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleDecide(p.id, "APPROVE")}
                          style={{ fontSize: "12px", fontWeight: 700, color: "#080b12", background: "#4ade80", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDecide(p.id, "DECLINE")}
                          style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", background: "#1e293b", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Decline
                        </button>
                      </div>
                    </>
                  ) : p.status === "EXPIRED" ? (
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 700, color: "#facc15", margin: "0 0 4px" }}>Expired</p>
                      <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
                        This proposal is no longer current enough for approval. Refresh the performance analysis and create a new proposal if the opportunity still exists.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "12px", fontWeight: 700, color: p.status === "APPROVED" ? "#4ade80" : "#94a3b8", margin: "0 0 8px" }}>
                        {p.status === "APPROVED" ? "Approved" : p.status === "DECLINED" ? "Declined" : p.status.replace(/_/g, " ").toLowerCase()}
                        {p.decidedAt ? ` on ${new Date(p.decidedAt).toLocaleDateString()}` : ""}
                        . No action has been taken.
                      </p>
                      {p.status === "APPROVED" && executionReadiness[p.id] && (
                        <div style={{ padding: "10px", background: "#0d1420", border: "1px solid #1e293b", borderRadius: "8px" }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: executionReadiness[p.id].status === "EXECUTABLE" ? "#4ade80" : "#94a3b8", margin: "0 0 6px" }}>
                            Execution readiness: {executionReadiness[p.id].status === "EXECUTABLE" ? "Ready" : "Not ready"}
                          </p>
                          {executionReadiness[p.id].messages.length > 0 && (
                            <>
                              <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 4px" }}>Why:</p>
                              {executionReadiness[p.id].messages.map((m) => (
                                <p key={m} style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>&bull; {m}</p>
                              ))}
                            </>
                          )}
                          <p style={{ fontSize: "11px", color: "#64748b", margin: "6px 0 0" }}>No advertising changes have been made.</p>
                        </div>
                      )}
                      {p.status === "APPROVED" && !specifications[p.id] && (
                        <button
                          onClick={() => handlePrepareAction(p.id)}
                          style={{ marginTop: "10px", fontSize: "12px", fontWeight: 700, color: "#e2e8f0", background: "#1e293b", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Prepare exact action
                        </button>
                      )}
                      {p.status === "APPROVED" && specifications[p.id] && specifications[p.id].status === "DRAFT" && (
                        <div style={{ marginTop: "10px", padding: "10px", background: "#0d1420", border: "1px solid #1e293b", borderRadius: "8px" }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px" }}>Prepare exact action</p>
                          <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Target</label>
                          <select
                            defaultValue=""
                            onChange={(e) => handleUpdateSpecField(specifications[p.id].id, "targetEntityId", e.target.value || null)}
                            style={{ width: "100%", marginBottom: "8px", fontSize: "12px", background: "#080b12", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: "6px", padding: "6px" }}
                          >
                            <option value="">Select a target...</option>
                            {availableTargets.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Creative</label>
                          <select
                            defaultValue=""
                            onChange={(e) => handleUpdateSpecField(specifications[p.id].id, "creativeAssetId", e.target.value || null)}
                            style={{ width: "100%", marginBottom: "8px", fontSize: "12px", background: "#080b12", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: "6px", padding: "6px" }}
                          >
                            <option value="">Select a creative...</option>
                            {availableAssets.map((a) => (
                              <option key={a.id} value={a.id}>{a.originalFilename ?? a.category}</option>
                            ))}
                          </select>
                          <label style={{ fontSize: "11px", color: "#64748b", display: "block", marginBottom: "4px" }}>Proposed test spend (in your account currency, as a whole-number amount)</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="e.g. 15"
                            onBlur={(e) => handleUpdateSpecField(specifications[p.id].id, "proposedSpendCents", e.target.value ? Math.round(Number(e.target.value) * 100) : null)}
                            style={{ width: "100%", marginBottom: "8px", fontSize: "12px", background: "#080b12", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: "6px", padding: "6px" }}
                          />
                          <button
                            onClick={() => handleFinalizeSpecification(specifications[p.id].id, p.id)}
                            style={{ fontSize: "12px", fontWeight: 700, color: "#080b12", background: "#4ade80", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Ready for owner authorization
                          </button>
                          {specMessage && (
                            <p style={{ fontSize: "11px", color: "#f87171", margin: "8px 0 0" }}>{specMessage}</p>
                          )}
                        </div>
                      )}
                      {p.status === "APPROVED" && specifications[p.id] && specifications[p.id].status === "READY_FOR_OWNER_AUTHORIZATION" && (
                        <div style={{ marginTop: "10px", padding: "10px", background: "#0d1420", border: "1px solid #1e293b", borderRadius: "8px" }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px" }}>Review exact advertising action</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Action: Test an alternative creative</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Meta account: {specifications[p.id].metaAdAccountId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Target: {specifications[p.id].targetEntityId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Creative: {specifications[p.id].creativeAssetId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>
                            Proposed test spend: {specifications[p.id].proposedSpendCents !== null ? (specifications[p.id].proposedSpendCents! / 100).toFixed(2) : "Not set"}
                          </p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Currency: {specifications[p.id].currency}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px" }}>Maximum current test budget: {p.maxAuthorizedSpendCents === null ? "Not set" : (p.maxAuthorizedSpendCents / 100).toFixed(2)}</p>
                          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                            <button
                              onClick={() => handleAuthorizeDecision(brandId, specifications[p.id].id, p.id, "AUTHORIZE")}
                              style={{ fontSize: "12px", fontWeight: 700, color: "#080b12", background: "#4ade80", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Authorize exact action
                            </button>
                            <button
                              onClick={() => handleAuthorizeDecision(brandId, specifications[p.id].id, p.id, "DECLINE")}
                              style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", background: "#1e293b", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Decline
                            </button>
                          </div>
                          {authBlockers.length > 0 && (
                            <div style={{ marginBottom: "8px" }}>
                              <p style={{ fontSize: "11px", color: "#f87171", margin: "0 0 4px" }}>This action cannot currently be authorized:</p>
                              {authBlockers.map((b) => (
                                <p key={b} style={{ fontSize: "11px", color: "#f87171", margin: "0 0 2px" }}>&bull; {b}</p>
                              ))}
                            </div>
                          )}
                          <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>No advertising changes will occur from this decision alone.</p>
                        </div>
                      )}
                      {p.status === "APPROVED" && specifications[p.id] && specifications[p.id].status === "AUTHORIZED" && (
                        <div style={{ marginTop: "10px", padding: "10px", background: "#0d1420", border: "1px solid #1e293b", borderRadius: "8px" }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#4ade80", margin: "0 0 6px" }}>Authorized</p>
                          <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 3px" }}>Authorized by: {specifications[p.id].decidedBy}</p>
                          <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 8px" }}>Authorized at: {specifications[p.id].decidedAt ? new Date(specifications[p.id].decidedAt!).toLocaleString() : ""}</p>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", margin: "0 0 6px" }}>Exact action:</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Account: {specifications[p.id].metaAdAccountId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Target: {specifications[p.id].targetEntityId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 3px" }}>Creative: {specifications[p.id].creativeAssetId}</p>
                          <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px" }}>Test spend: {specifications[p.id].proposedSpendCents !== null ? (specifications[p.id].proposedSpendCents! / 100).toFixed(2) : ""} {specifications[p.id].currency}</p>
                          <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>No advertising changes have been made yet.</p>
                        </div>
                      )}
                      {p.status === "APPROVED" && specifications[p.id] && specifications[p.id].status === "DECLINED" && (
                        <div style={{ marginTop: "10px", padding: "10px", background: "#0d1420", border: "1px solid #1e293b", borderRadius: "8px" }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", margin: "0 0 6px" }}>Declined</p>
                          <p style={{ fontSize: "11px", color: "#64748b", margin: "0 0 8px" }}>Declined at: {specifications[p.id].decidedAt ? new Date(specifications[p.id].decidedAt!).toLocaleString() : ""}</p>
                          <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>No advertising changes have been made.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
