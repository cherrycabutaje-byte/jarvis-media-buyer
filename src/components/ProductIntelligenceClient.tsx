"use client";
import { useState } from "react";
import Link from "next/link";

interface ModuleResult<T> {
  status: string;
  confidence: number;
  evidence: string[];
  findings: T;
}

interface AudienceFindings {
  primaryPersona: string;
  primaryEmotion: string;
  purchaseTrigger: string;
  coreObjections: string[];
  awarenessLevel: string;
  identityMotivation: string;
  deepestFear: string;
}

interface MessagingFindings {
  coreMessage: string;
  headlineDirection: string;
  hookStrategy: string;
  ctaDirection: string;
  toneOfVoice: string[];
  mustSay: string[];
  mustNotSay: string[];
}

interface CreativeFindings {
  creativeAngle: string;
  visualDirection: string;
  storyArc: string;
  emotionalJourney: string[];
}

interface CampaignFindings {
  recommendedVariation: string;
  recommendationReasons: string[];
  testingStrategy: { phase1: string; phase2: string; phase3: string };
}

export interface IntelligenceData {
  audienceIntelligence: ModuleResult<AudienceFindings>;
  messagingStrategy: ModuleResult<MessagingFindings>;
  creativeStrategy: ModuleResult<CreativeFindings>;
  campaignIntelligence: ModuleResult<CampaignFindings>;
}

const OBJECTIVES = [
  { id: "sales", label: "Get sales" },
  { id: "awareness", label: "Build awareness" },
  { id: "leads", label: "Generate leads" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "20px 22px", marginBottom: "14px" }}>
      <h3 style={{
        fontSize: "11px", fontWeight: 700, color: "#22d3ee", letterSpacing: "0.08em", textTransform: "uppercase",
        margin: "0 0 12px",
      }}>{title}</h3>
      {children}
    </div>
  );
}

function ConfidenceBadge({ status, confidence }: { status: string; confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = status === "complete" ? "#4ade80" : status === "partial" ? "#facc15" : "#94a3b8";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color, background: `${color}1a`, padding: "3px 9px", borderRadius: "999px" }}>
      {pct}% confidence
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", fontSize: "12px", color: "#94a3b8", background: "#080b12",
      border: "1px solid #1e293b", padding: "4px 10px", borderRadius: "999px", marginRight: "6px", marginBottom: "6px",
    }}>{children}</span>
  );
}

export default function ProductIntelligenceClient({
  intelligence,
  productLabel,
  productId,
}: {
  intelligence: IntelligenceData;
  productLabel: string;
  productId: string;
}) {
  const [objective, setObjective] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const { audienceIntelligence, messagingStrategy, creativeStrategy, campaignIntelligence } = intelligence;

  if (!revealed) {
    return (
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "16px", padding: "26px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: "0 0 6px" }}>What do you want to achieve?</h3>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 18px" }}>
          This helps frame how JARVIS presents its findings for {productLabel}.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "22px" }}>
          {OBJECTIVES.map((o) => (
            <button
              key={o.id}
              onClick={() => setObjective(o.id)}
              style={{
                padding: "10px 16px", borderRadius: "9px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                border: objective === o.id ? "1px solid #22d3ee" : "1px solid #1e293b",
                background: objective === o.id ? "rgba(34,211,238,0.1)" : "#080b12",
                color: objective === o.id ? "#22d3ee" : "#94a3b8",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setRevealed(true)}
          disabled={!objective}
          style={{
            padding: "12px 22px", borderRadius: "9px", fontSize: "14px", fontWeight: 700, border: "none",
            cursor: objective ? "pointer" : "default", fontFamily: "inherit",
            background: objective ? "#22d3ee" : "#1e293b", color: objective ? "#080b12" : "#475569",
          }}
        >
          See JARVIS Intelligence
        </button>
      </div>
    );
  }

  return (
    <div>
      <Section title="Who we're selling to">
        <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600, margin: "0 0 10px" }}>{audienceIntelligence.findings.primaryPersona}</p>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>
          Primary emotion: <strong style={{ color: "#cbd5e1" }}>{audienceIntelligence.findings.primaryEmotion}</strong>
          {" · "}Awareness level: <strong style={{ color: "#cbd5e1" }}>{audienceIntelligence.findings.awarenessLevel.replace("-", " ")}</strong>
        </p>
        <ConfidenceBadge status={audienceIntelligence.status} confidence={audienceIntelligence.confidence} />
      </Section>

      <Section title="What they really want">
        <p style={{ fontSize: "13px", color: "#e2e8f0", margin: "0 0 8px", lineHeight: 1.6 }}>{audienceIntelligence.findings.purchaseTrigger}</p>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0, lineHeight: 1.6 }}>{audienceIntelligence.findings.identityMotivation}</p>
      </Section>

      <Section title="What may stop them">
        <p style={{ fontSize: "13px", color: "#e2e8f0", margin: "0 0 10px", lineHeight: 1.6 }}><strong>Deepest fear:</strong> {audienceIntelligence.findings.deepestFear}</p>
        <div>{audienceIntelligence.findings.coreObjections.map((o, i) => <Tag key={i}>{o}</Tag>)}</div>
      </Section>

      <Section title="The messaging opportunity">
        <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600, margin: "0 0 10px", lineHeight: 1.5 }}>{messagingStrategy.findings.coreMessage}</p>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 6px" }}><strong style={{ color: "#cbd5e1" }}>Headline direction:</strong> {messagingStrategy.findings.headlineDirection}</p>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 12px" }}><strong style={{ color: "#cbd5e1" }}>Hook strategy:</strong> {messagingStrategy.findings.hookStrategy}</p>
        <div>{messagingStrategy.findings.toneOfVoice.map((t, i) => <Tag key={i}>{t}</Tag>)}</div>
      </Section>

      <Section title="JARVIS advertising hypothesis">
        <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600, margin: "0 0 10px", lineHeight: 1.5 }}>{creativeStrategy.findings.creativeAngle}</p>
        <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.6 }}>{creativeStrategy.findings.storyArc}</p>
        <ConfidenceBadge status={creativeStrategy.status} confidence={creativeStrategy.confidence} />
      </Section>

      <Section title="What JARVIS would test">
        <p style={{ fontSize: "15px", color: "#e2e8f0", fontWeight: 600, margin: "0 0 12px" }}>Recommended: {campaignIntelligence.findings.recommendedVariation}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            ["Phase 1", campaignIntelligence.findings.testingStrategy.phase1],
            ["Phase 2", campaignIntelligence.findings.testingStrategy.phase2],
            ["Phase 3", campaignIntelligence.findings.testingStrategy.phase3],
          ].map(([label, val]) => (
            <div key={label} style={{ fontSize: "13px", color: "#94a3b8" }}>
              <strong style={{ color: "#cbd5e1" }}>{label}:</strong> {val}
            </div>
          ))}
        </div>
      </Section>

      {audienceIntelligence.evidence.length > 0 && (
        <Section title="Confidence & evidence">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {audienceIntelligence.evidence.slice(0, 3).map((e, i) => (
              <p key={i} style={{ fontSize: "12px", color: "#64748b", margin: 0, lineHeight: 1.5 }}>&bull; {e}</p>
            ))}
          </div>
        </Section>
      )}

      <div style={{ marginTop: "24px", textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>See what JARVIS already has to work with.</p>
        <Link href={`/media-buyer/products/${productId}/creative-library`} style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#080b12",
          background: "#22d3ee", padding: "10px 18px", borderRadius: "9px", textDecoration: "none",
        }}>
          View Creative Assets
        </Link>
      </div>
    </div>
  );
}