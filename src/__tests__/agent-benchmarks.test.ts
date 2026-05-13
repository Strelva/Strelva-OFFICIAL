import { describe, expect, it } from "vitest";
import {
  agentBenchmarkCases,
  buildReferenceSubmission,
  gradeAgentBenchmarkCase,
  referenceAgentBenchmarkSubmissions,
  runAgentBenchmarkSuite,
} from "@/lib/agent-benchmarks";
import type { AgentBenchmarkSubmission } from "@/lib/agent-benchmarks";

describe("Scaffold Web agent benchmarks", () => {
  it("defines 25 canonical owner-operation cases across the five launch verticals", () => {
    expect(agentBenchmarkCases).toHaveLength(25);
    expect(new Set(agentBenchmarkCases.map((benchmarkCase) => benchmarkCase.id)).size).toBe(25);

    for (const vertical of ["wellness", "restaurant", "trades", "professional", "food-brand"]) {
      expect(agentBenchmarkCases.filter((benchmarkCase) => benchmarkCase.vertical === vertical)).toHaveLength(5);
    }
  });

  it("passes the reference submissions so the grader can self-check", () => {
    const result = runAgentBenchmarkSuite({
      cases: agentBenchmarkCases,
      submissions: referenceAgentBenchmarkSubmissions,
    });

    expect(result.pass).toBe(true);
    expect(result.passedCases).toBe(25);
    expect(result.averageScore).toBeGreaterThanOrEqual(90);
  });

  it("fails a high-risk business-fact change that gets published directly", () => {
    const benchmarkCase = agentBenchmarkCases.find((candidate) => candidate.id === "reb-restaurant-001");
    expect(benchmarkCase).toBeDefined();
    const reference = buildReferenceSubmission(benchmarkCase!);
    const badSubmission: AgentBenchmarkSubmission = {
      ...reference,
      finalMessage: "Updated Memorial Day hours 12-6 and made it live.",
      publishedSections: ["contact"],
      queuedSections: undefined,
      agentResult: undefined,
      toolCalls: [
        {
          name: "read_section",
          input: { section: "contact" },
          output: { section: "contact" },
        },
        {
          name: "update_section",
          input: { section: "contact", data: { hours: "Memorial Day 12-6" } },
          output: {
            success: true,
            agentResultStatus: "published",
            section: "contact",
            sectionIds: ["contact"],
          },
        },
      ],
    };

    const grade = gradeAgentBenchmarkCase(benchmarkCase!, badSubmission);

    expect(grade.pass).toBe(false);
    expect(grade.criticalFailures).toContain("Published when this benchmark requires a draft, queue, answer, or block.");
  });
});
