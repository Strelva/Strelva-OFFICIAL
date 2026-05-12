import { buildAgentResultContract } from "@/lib/agent-results";
import type { ContentSection } from "@/lib/types";
import { agentBenchmarkCases } from "./cases";
import type { AgentBenchmarkCase, AgentBenchmarkOutcome, AgentBenchmarkSubmission, AgentBenchmarkToolCall } from "./types";

function statusForOutcome(outcome: AgentBenchmarkOutcome): "published" | "queued" | "drafted" | "blocked" | "no-op" {
  if (outcome === "answered") return "no-op";
  return outcome;
}

function primarySection(benchmarkCase: AgentBenchmarkCase): ContentSection | undefined {
  return benchmarkCase.expected.touchedSections?.[0];
}

function buildToolCalls(benchmarkCase: AgentBenchmarkCase): AgentBenchmarkToolCall[] {
  const section = primarySection(benchmarkCase);
  const status = statusForOutcome(benchmarkCase.expected.outcome);
  const calls: AgentBenchmarkToolCall[] = [];

  for (const toolName of benchmarkCase.expected.requiredTools || []) {
    if (toolName === "read_section" && section) {
      calls.push({ name: "read_section", input: { section }, output: { section, current: true }, status: "ok" });
    } else if (toolName === "update_section" && section) {
      calls.push({
        name: "update_section",
        input: { section, data: { benchmarkTerms: benchmarkCase.expected.requiredTerms || [] } },
        output: {
          success: status !== "blocked",
          agentResultStatus: status === "no-op" ? "queued" : status,
          section,
          sectionIds: [section],
          eventId: status === "queued" ? `evt_${benchmarkCase.id}` : undefined,
          eventIds: status === "queued" ? [`evt_${benchmarkCase.id}`] : undefined,
          message: `${benchmarkCase.title} handled for ${section}`,
          sourceProof: `Source: Site content and ${section} section data`,
        },
        status: status === "no-op" ? "queued" : status,
      });
    } else {
      calls.push({
        name: toolName,
        input: {},
        output: {
          success: true,
          agentResultStatus: status === "no-op" ? undefined : status,
          message: `${toolName} completed for ${benchmarkCase.id}`,
        },
        status: "ok",
      });
    }
  }

  return calls;
}

function messageForCase(benchmarkCase: AgentBenchmarkCase): string {
  const expected = benchmarkCase.expected;
  const section = primarySection(benchmarkCase);
  const required = (expected.requiredTerms || []).join(", ");
  const evidence = (expected.evidenceTerms || []).join(", ");
  const voice = (expected.voiceTerms || []).join(", ");
  const base =
    expected.outcome === "published"
      ? `Saved and made live: ${required}. Source: ${section || "site"} ${evidence}. Next: view the live site.`
      : expected.outcome === "answered"
        ? `No site changes made. Here is the plain answer: ${required}. Source: ${evidence}. Next: one focused recommendation from the proof.`
        : expected.outcome === "blocked"
          ? `I can't do that directly, but I can support the website side: ${required}. Source: ${evidence}. Next: tell me whether you want a site notice draft?`
          : `Saved a draft for review: ${required}. Source: ${section || "site"} ${evidence}. Next: review before anything goes live.`;

  return voice ? `${base} Tone: ${voice}.` : base;
}

export function buildReferenceSubmission(benchmarkCase: AgentBenchmarkCase): AgentBenchmarkSubmission {
  const toolCalls = buildToolCalls(benchmarkCase);
  const actionResults = toolCalls
    .map((call) => call.output)
    .filter((output): output is Record<string, unknown> => !!output && typeof output === "object")
    .map((output) => {
      const status = output.agentResultStatus;
      if (typeof status !== "string") return null;
      return {
        status: status as "published" | "queued" | "drafted" | "blocked",
        sectionIds: Array.isArray(output.sectionIds) ? output.sectionIds.filter((value): value is string => typeof value === "string") : undefined,
        eventIds: Array.isArray(output.eventIds) ? output.eventIds.filter((value): value is string => typeof value === "string") : undefined,
        message: typeof output.message === "string" ? output.message : undefined,
        sourceProof: typeof output.sourceProof === "string" ? output.sourceProof : undefined,
      };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const agentResult = buildAgentResultContract(actionResults);

  return {
    caseId: benchmarkCase.id,
    finalMessage: messageForCase(benchmarkCase),
    toolCalls,
    changedSections: benchmarkCase.expected.touchedSections,
    queuedSections: benchmarkCase.expected.outcome === "queued" ? benchmarkCase.expected.touchedSections : undefined,
    draftedSections: benchmarkCase.expected.outcome === "drafted" ? benchmarkCase.expected.touchedSections : undefined,
    publishedSections: benchmarkCase.expected.outcome === "published" ? benchmarkCase.expected.touchedSections : undefined,
    blocked: benchmarkCase.expected.outcome === "blocked",
    askedClarifyingQuestion: benchmarkCase.expected.requiresClarifyingQuestion,
    agentResult,
  };
}

export const referenceAgentBenchmarkSubmissions = agentBenchmarkCases.map(buildReferenceSubmission);
