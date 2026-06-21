export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  score: number; // 0-100
  message: string;
  details?: string;
  /** Plain-English "what this costs you" line (from the impact narrative).
   *  Populated for failing/warning checks; omitted when passing or n/a. */
  impact?: string;
  /** Fix priority for the action list. Derived from status + weight. */
  priority?: "high" | "medium" | "low";
}

export interface CategoryResult {
  name: string;
  slug: string;
  weight: number;
  score: number; // 0-100
  checks: CheckResult[];
}

export type LetterGrade = "A" | "B" | "C" | "D" | "F";

export interface AuditResult {
  url: string;
  scannedAt: string;
  overallScore: number;
  grade: LetterGrade;
  categories: CategoryResult[];
}

export interface PageSpeedResult {
  lighthouseResult?: {
    audits?: Record<
      string,
      {
        score?: number | null;
        numericValue?: number;
        displayValue?: string;
      }
    >;
    categories?: {
      performance?: { score?: number | null };
      accessibility?: { score?: number | null };
    };
  };
}
