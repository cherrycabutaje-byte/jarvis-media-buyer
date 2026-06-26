// VisaLogic + JARVIS Shared Intelligence Types
// Never redefine these. Always import from here.

// ============================================
// JARVIS MARKETING TYPES
// ============================================

export type ReportMode = "quick" | "full";

export type SupportedLanguage =
  | "English"
  | "Tagalog"
  | "Spanish"
  | "French"
  | "Arabic"
  | "Japanese"
  | "German"
  | "Italian"
  | "Portuguese"
  | "Auto-Detect";

export interface AnalyzeRequest {
  input: string;
  language: SupportedLanguage;
  mode: ReportMode;
}

export interface AnalyzeResponse {
  result?: string;
  error?: string;
}

export interface ExpertOutput {
  psychologist: string;
  mediaBuyer: string;
  growthStrategist: string;
  offerStrategist: string;
}

export interface CaptureEmailRequest {
  email: string;
  language: string;
}

export interface CaptureEmailResponse {
  success?: boolean;
  error?: string;
}

// ============================================
// VISALOGIC TYPES (for future use)
// ============================================

export type VisaType =
  | "tourist"
  | "family"
  | "spouse"
  | "fiance"
  | "work"
  | "student"
  | "transit"
  | "business";

export type RiskLevel = "low" | "medium" | "high";

export type TrustSignal = "positive" | "neutral" | "negative";

export interface VisaApplicant {
  nationality: string;
  destinationCountry: string;
  visaType: VisaType;
  purpose: string;
  employmentStatus: string;
  monthlyIncome?: string;
  savings?: string;
  travelHistory?: string;
  relationshipStatus?: string;
  previousRefusals?: string;
  additionalInfo?: string;
}

export interface BrainOutput {
  brainName: string;
  coreQuestion: string;
  findings: string;
  trustSignals: TrustSignal[];
  riskLevel: RiskLevel;
  recommendations: string[];
}

export interface VisaReport {
  overallAssessment: string;
  officerPerspective: string;
  trustGaps: string[];
  storyStrengtheners: string[];
  priorityDocuments: string[];
  actionPlan: string[];
  coverLetterStrategy: string;
  beliefScore: string;
}