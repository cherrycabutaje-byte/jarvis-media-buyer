/**
 * JARVIS Brain - Module 14: Prompt Builder
 * Architecture V4.3 Engineering Baseline
 * PHASE 2 - BUILDER LAYER TRANSLATION MODULE
 *
 * ARCHITECTURAL NOTE:
 * This is a Translation Module. It does not think, strategize, or
 * make marketing decisions. It translates an already-completed
 * TextStrategyBrief into a provider-neutral ProviderPrompt.
 *
 * PERMANENT BOUNDARY: The text provider (Claude, or any future text
 * provider) must NEVER receive Business Intelligence, Audience
 * Intelligence, Competitor Intelligence, Offer Intelligence,
 * Positioning, Messaging Strategy, Creative Strategy, Campaign
 * Architecture, variation definitions, or any Brain reasoning. The
 * provider receives ONLY the ProviderPrompt produced here, which is
 * itself built from nothing but TextStrategyBrief. This module does
 * not import, reference, or have access to any of those upstream
 * types - the boundary is enforced structurally by this file's own
 * import list, not just by convention.
 *
 * RULES:
 * - Pure deterministic function. No side effects.
 * - No AI provider calls. No Claude SDK. No OpenAI SDK.
 * - No database access.
 * - No external services. No HTTP.
 * - No randomness.
 * - Never invent new strategy, never optimize, never reinterpret
 *   Brain decisions - preserve strategy, tone, constraints, required
 *   sections, and prohibited content exactly as given.
 * - Unknown values marked explicitly.
 * - All output JSON-serializable for future memory caching.
 * - Module identity is expressed only through the outer wrapper's
 *   `module` field - findings objects do not duplicate it with `_module`.
 *
 * DEPENDENCY: types.ts only. Consumes only TextStrategyBrief (bare,
 * as it is never itself wrapped in IntelligenceModuleResult<T>) and
 * the public contract of Decision Engine's result.
 */

import type {
  TextStrategyBrief,
  DecisionRecord,
  ProviderPrompt,
  IntelligenceModuleResult,
  ModuleStatus,
} from "@/lib/jarvis-brain/types";

// ============================================================
// INTERNAL HELPERS
// ============================================================

function buildSystemPrompt(brief: TextStrategyBrief): string {
  const parts: string[] = [];

  parts.push("You are a marketing copywriter following a fixed creative brief.");
  parts.push("Tone of voice: " + brief.toneOfVoice.join(", ") + ".");
  parts.push("You must include the following points: " + brief.whatToSay.join("; ") + ".");
  parts.push("You must never say or imply: " + brief.whatNotToSay.join("; ") + ".");
  parts.push("Required sections: " + brief.format.components.join(", ") + ".");
  parts.push("Length guidance: " + brief.format.lengthGuidance + ".");
  parts.push("Write only in this language: " + brief.language + ".");
  parts.push("Do not introduce claims, features, or promises not present in this brief.");

  return parts.join(" ");
}

function buildUserPrompt(brief: TextStrategyBrief): string {
  return (
    "Write the required copy for asset type: " + brief.assetType + ". " +
    "Audience: " + brief.audience + ". " +
    "Primary emotional angle: " + brief.primaryEmotion + ". " +
    "Strategic angle: " + brief.angle + "."
  );
}

function buildConstraints(brief: TextStrategyBrief): string[] {
  const constraints: string[] = [];
  for (const item of brief.whatNotToSay) {
    constraints.push("Must not say: " + item);
  }
  constraints.push("Length: " + brief.format.lengthGuidance);
  constraints.push("Language: " + brief.language);
  return constraints;
}

function checkBuildAuthorized(decisionRecord: DecisionRecord): boolean {
  return decisionRecord.decisionLog.some(
    (entry) => entry.decision === "Package routing: proceed to Prompt Builder"
  );
}

// ============================================================
// PUBLIC API
// ============================================================

export function buildProviderPrompt(
  textStrategyBrief: TextStrategyBrief,
  decisionRecord: IntelligenceModuleResult<DecisionRecord>
): IntelligenceModuleResult<ProviderPrompt> {
  const decisionData = decisionRecord.findings;

  const systemPrompt = buildSystemPrompt(textStrategyBrief);
  const userPrompt = buildUserPrompt(textStrategyBrief);
  const constraints = buildConstraints(textStrategyBrief);
  const buildAuthorized = checkBuildAuthorized(decisionData);

  const variables: Record<string, string> = {
    assetType: textStrategyBrief.assetType,
    audience: textStrategyBrief.audience,
    primaryEmotion: textStrategyBrief.primaryEmotion,
    angle: textStrategyBrief.angle,
    platform: textStrategyBrief.format.platform ?? "unspecified",
  };

  const findings: ProviderPrompt = {
    systemPrompt,
    userPrompt,
    outputFormat: "Structured sections: " + textStrategyBrief.format.components.join(", "),
    constraints,
    variables,
    language: textStrategyBrief.language,
    expectedDeliverables: textStrategyBrief.format.components,
    metadata: {
      variationId: textStrategyBrief.variationId,
      productType: textStrategyBrief.assetType,
      assetType: textStrategyBrief.assetType,
    },
  };

  const unknowns: string[] = [];
  if (!buildAuthorized) {
    unknowns.push(
      "Decision Engine did not authorize proceeding to Prompt Builder for this variation - the prompt was still built deterministically, but should not be sent to a provider until routing is resolved"
    );
  }
  if (decisionData.leadAngle !== textStrategyBrief.angle && !decisionData.leadAngle.startsWith("UNKNOWN")) {
    unknowns.push(
      "Decision Engine's lead angle does not match this brief's angle - verify this is the recommended variation"
    );
  }

  const evidence: string[] = [
    "System prompt built from tone of voice, must-say, must-not-say, and required sections (TextStrategyBrief)",
    "User prompt built from audience, primary emotion, and strategic angle (TextStrategyBrief)",
    "Build authorization cross-checked against Decision Engine's package routing decision",
    "No content beyond TextStrategyBrief and Decision Engine's routing status was consumed - no raw Brain objects were referenced",
  ];

  const hasCritical = !buildAuthorized;
  const status: ModuleStatus = hasCritical
    ? "unknown"
    : unknowns.length > 0
    ? "partial"
    : "complete";

  const unknownPenalty = Math.min(unknowns.length * 0.05, 0.2);
  const confidence = Math.max(0.2, Math.min(decisionRecord.confidence - unknownPenalty, 1.0));

  return {
    module: "PromptBuilder",
    status,
    confidence,
    evidence,
    unknowns,
    recommendationsForNext: [
      buildAuthorized
        ? "Proceed to text provider call with this ProviderPrompt"
        : "Hold - resolve Decision Engine's package routing before calling a text provider",
      "Expected deliverables: " + textStrategyBrief.format.components.join(", "),
    ],
    findings,
  };
}