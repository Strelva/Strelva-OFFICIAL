/**
 * Browser-safe contracts for the AI Visibility product.
 *
 * Keep these types free of storage, model-provider, and Node imports so the
 * conversational UI can consume the result shape without pulling server code
 * into the client bundle.
 */

export type Grade = "A" | "B" | "C" | "D" | "F";
export type MeasurementStatus = "measured" | "partial" | "unavailable";

export interface Signal {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  weight: number;
}

export interface CitationProbe {
  probed: boolean;
  mentioned: boolean;
  recommended: boolean;
  note: string;
}

export interface AiVisibilityResult {
  business: string;
  url?: string;
  score: number;
  grade: Grade;
  verdict: string;
  signals: Signal[];
  citation: CitationProbe;
  topFix: string;
  /**
   * Optional during the compatibility window so previously stored scorecards
   * remain readable. New runs always set this field. Consumers must not present
   * the legacy score/grade when the status is `unavailable`.
   */
  measurementStatus?: MeasurementStatus;
  measurementNote?: string;
  /** Whether the readiness inputs required to present score/grade were measured. */
  readinessMeasured?: boolean;
}

export interface ScoreInput {
  business: string;
  url?: string;
  category?: string;
  location?: string;
}

export interface StoredAiVisibilityResult {
  id: string;
  result: AiVisibilityResult;
  input: Pick<ScoreInput, "category" | "location">;
  source?: string;
  createdAt: string;
}
