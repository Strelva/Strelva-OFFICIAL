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
  /** Quantified loss estimate, e.g. "~$300/mo" or "~12 customers/mo". Derived
   *  from default per-business metrics (no client analytics needed). */
  quantified?: string;
  /** Fix priority for the action list. Derived from status + weight. */
  priority?: "high" | "medium" | "low";
}

export interface CategoryResult {
  name: string;
  slug: string;
  weight: number;
  score: number; // 0-100
  checks: CheckResult[];
  /** Cross-links to `/guides` articles that fix this category, set by the
   *  server-only runner when the category needs improvement. Plain inline type
   *  on purpose: NEVER import from guides.ts here (that would bundle all guide
   *  HTML into any client component that imports this types module). */
  guides?: { slug: string; title: string }[];
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
