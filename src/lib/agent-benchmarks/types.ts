import type { AgentResultContract, AgentResultStatus } from "@/lib/agent-results";
import type { ContentSection, TemplateId } from "@/lib/types";

export type AgentBenchmarkVertical =
  | "wellness"
  | "restaurant"
  | "trades"
  | "professional"
  | "food-brand";

export type AgentBenchmarkCapability =
  | "content_update"
  | "content_rewrite"
  | "review_response"
  | "metrics_diagnosis"
  | "social_or_newsletter"
  | "logistics_boundary"
  | "suggestion";

export type AgentBenchmarkDifficulty = "easy" | "medium" | "hard";

export type AgentBenchmarkOutcome =
  | "published"
  | "queued"
  | "drafted"
  | "blocked"
  | "answered";

export type AgentBenchmarkRubricKey =
  | "taskSuccess"
  | "safety"
  | "specificity"
  | "diffQuality"
  | "voiceFit"
  | "receiptQuality"
  | "recovery";

export interface AgentBenchmarkExpected {
  outcome: AgentBenchmarkOutcome;
  touchedSections?: ContentSection[];
  preservedSections?: ContentSection[];
  requiredTools?: string[];
  forbiddenTools?: string[];
  requiredTerms?: string[];
  forbiddenTerms?: string[];
  evidenceTerms?: string[];
  voiceTerms?: string[];
  requiresApproval?: boolean;
  disallowsPublish?: boolean;
  requiresClarifyingQuestion?: boolean;
  minimumScore: number;
}

export interface AgentBenchmarkCase {
  id: string;
  title: string;
  vertical: AgentBenchmarkVertical;
  template: TemplateId;
  capability: AgentBenchmarkCapability;
  difficulty: AgentBenchmarkDifficulty;
  ownerPrompt: string;
  successMoment: string;
  tags: string[];
  expected: AgentBenchmarkExpected;
}

export interface AgentBenchmarkToolCall {
  name: string;
  input?: unknown;
  output?: unknown;
  status?: AgentResultStatus | "ok" | "error";
  error?: string;
}

export interface AgentBenchmarkSubmission {
  caseId: string;
  finalMessage: string;
  toolCalls: AgentBenchmarkToolCall[];
  changedSections?: ContentSection[];
  publishedSections?: ContentSection[];
  queuedSections?: ContentSection[];
  draftedSections?: ContentSection[];
  blocked?: boolean;
  askedClarifyingQuestion?: boolean;
  agentResult?: AgentResultContract;
  notes?: string;
}

export interface AgentBenchmarkRubricScore {
  key: AgentBenchmarkRubricKey;
  label: string;
  max: number;
  score: number;
  notes: string[];
}

export interface AgentBenchmarkGrade {
  caseId: string;
  title: string;
  vertical: AgentBenchmarkVertical;
  capability: AgentBenchmarkCapability;
  score: number;
  maxScore: number;
  pass: boolean;
  expectedOutcome: AgentBenchmarkOutcome;
  observedOutcome: AgentBenchmarkOutcome;
  rubric: AgentBenchmarkRubricScore[];
  issues: string[];
  criticalFailures: string[];
}

export interface AgentBenchmarkSuiteResult {
  generatedAt: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  pass: boolean;
  failUnder: number;
  grades: AgentBenchmarkGrade[];
}
