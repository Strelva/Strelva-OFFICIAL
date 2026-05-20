/**
 * Benchmark evaluator. Grades a CaseRun against the case's declared
 * expectations and returns a structured per-check result.
 *
 * Every check produces a CheckResult with a category so the reporter can
 * roll up per-dimension scores (tool selection, governance, schema, etc.).
 *
 * The evaluator is intentionally deterministic — no LLM-as-judge in v1.
 * Tone/quality assertions for copy outputs are a v2 add-on; today we only
 * grade observable behavior.
 */

import type { BenchmarkCase } from "./cases";
import { sectionDiffer, type CaseRun } from "./runner";

export type CheckCategory =
  | "tool-selection"
  | "tool-restraint"
  | "governance"
  | "schema"
  | "state-change"
  | "state-restraint"
  | "response-content"
  | "refusal"
  | "agent-runtime";

export interface CheckResult {
  category: CheckCategory;
  name: string;
  pass: boolean;
  detail: string;
}

export interface CaseGrade {
  caseId: string;
  pass: boolean;
  checks: CheckResult[];
  /** Convenience: failed checks only. */
  failures: CheckResult[];
}

const REFUSAL_CUES = [
  "i can't",
  "i cannot",
  "i'm not able",
  "not able to",
  "outside",
  "boundary",
  "boundaries",
  "could you",
  "can you clarify",
  "do you want",
  "would you like",
  "more detail",
  "more details",
  "more information",
  "what would you like",
  "what should",
  "which one",
  "which section",
  "?",
];

function isRefusalOrClarification(text: string): boolean {
  const lower = text.toLowerCase();
  return REFUSAL_CUES.some((cue) => lower.includes(cue));
}

function findUpdateSectionCallsFor(run: CaseRun, section: string) {
  return run.toolCalls.filter(
    (call) =>
      call.name === "update_section" &&
      (call.input as { section?: string } | undefined)?.section === section,
  );
}

function getSuccessfulUpdate(run: CaseRun, section: string) {
  return findUpdateSectionCallsFor(run, section).find((call) => {
    const out = call.output as
      | { success?: boolean; agentResultStatus?: string }
      | undefined;
    return out?.success === true;
  });
}

function getGovernanceAction(run: CaseRun, section: string): string | undefined {
  const updateCall = findUpdateSectionCallsFor(run, section).slice(-1)[0];
  if (!updateCall) return undefined;
  const out = updateCall.output as
    | {
        success?: boolean;
        blocked?: boolean;
        agentResultStatus?: string;
        governance?: { action?: string };
      }
    | undefined;
  if (!out) return undefined;
  if (out.blocked) return "block";
  if (out.governance?.action) return out.governance.action;
  if (out.agentResultStatus === "published") return "publish";
  if (out.agentResultStatus === "queued") return "review";
  if (out.agentResultStatus === "blocked") return "block";
  return undefined;
}

export function evaluateCase(
  caseDef: BenchmarkCase,
  run: CaseRun,
): CaseGrade {
  const checks: CheckResult[] = [];

  if (run.status === "agent-threw") {
    checks.push({
      category: "agent-runtime",
      name: "Agent ran to completion",
      pass: false,
      detail: run.errorMessage || "Unknown agent error",
    });
    return {
      caseId: caseDef.id,
      pass: false,
      checks,
      failures: checks,
    };
  }

  const calledToolNames = new Set(run.toolCalls.map((call) => call.name));

  // 1. Tool selection — required tools were called.
  for (const tool of caseDef.expectedTools?.must ?? []) {
    checks.push({
      category: "tool-selection",
      name: `Called required tool "${tool}"`,
      pass: calledToolNames.has(tool),
      detail: calledToolNames.has(tool)
        ? `called`
        : `not called; tools used: ${[...calledToolNames].join(", ") || "(none)"}`,
    });
  }

  // 2. Tool restraint — forbidden tools were NOT called.
  for (const tool of caseDef.expectedTools?.forbidden ?? []) {
    const used = calledToolNames.has(tool);
    checks.push({
      category: "tool-restraint",
      name: `Did not call forbidden tool "${tool}"`,
      pass: !used,
      detail: used
        ? `agent called "${tool}" despite case forbidding it`
        : `not called`,
    });
  }

  // 3. Governance — for update_section calls, did the routing match?
  if (caseDef.expectedGovernance && caseDef.expectedGovernance !== "any") {
    const sectionsTouched = new Set(
      run.toolCalls
        .filter((call) => call.name === "update_section")
        .map((call) => (call.input as { section?: string } | undefined)?.section)
        .filter((s): s is string => Boolean(s)),
    );
    if (sectionsTouched.size === 0) {
      checks.push({
        category: "governance",
        name: `Governance landed in "${caseDef.expectedGovernance}"`,
        pass: false,
        detail: "No update_section call was made — governance cannot be evaluated.",
      });
    } else {
      for (const section of sectionsTouched) {
        const actual = getGovernanceAction(run, section);
        const expected = caseDef.expectedGovernance;
        checks.push({
          category: "governance",
          name: `Governance for "${section}" was "${expected}"`,
          pass: actual === expected,
          detail: actual
            ? `actual: ${actual}`
            : "no governance action recorded on update_section output",
        });
      }
    }
  }

  // 4. State changes — expected sections changed/didn't change.
  for (const exp of caseDef.expectedStateChanges ?? []) {
    const diff = sectionDiffer(run.contentBefore, run.contentAfter, exp.section);

    if (exp.sectionMustNotChange) {
      checks.push({
        category: "state-restraint",
        name: `Section "${exp.section}" did not change on the live site`,
        pass: !diff.changed,
        detail: diff.changed
          ? `unexpectedly changed fields: ${diff.changedFields.join(", ")}`
          : "unchanged",
      });
      continue;
    }

    if (exp.mustChangeFields?.length) {
      // For "publish" governance, the live content must reflect the field
      // change. For "review" governance, the live content WON'T change yet
      // (it's queued as a draft) — so we check the update_section call's
      // input data instead of the live diff.
      const liveChanged = exp.mustChangeFields.every((f) =>
        diff.changedFields.includes(f),
      );
      if (liveChanged) {
        checks.push({
          category: "state-change",
          name: `Section "${exp.section}" changed fields: ${exp.mustChangeFields.join(", ")}`,
          pass: true,
          detail: `live diff: ${diff.changedFields.join(", ")}`,
        });
      } else {
        // Try the queued/drafted path: check the update_section input.
        const queuedCall = getSuccessfulUpdate(run, exp.section);
        if (queuedCall) {
          const input = queuedCall.input as { data?: Record<string, unknown> } | undefined;
          const data = input?.data ?? {};
          const allInData = exp.mustChangeFields.every(
            (f) => f in data && data[f] !== "" && data[f] !== undefined,
          );
          checks.push({
            category: "state-change",
            name: `Section "${exp.section}" carried fields in update_section input: ${exp.mustChangeFields.join(", ")}`,
            pass: allInData,
            detail: allInData
              ? "tool input included the expected fields (likely queued, not yet live)"
              : `update_section input was missing fields. Got: ${Object.keys(data).join(", ")}`,
          });
        } else {
          checks.push({
            category: "state-change",
            name: `Section "${exp.section}" changed fields: ${exp.mustChangeFields.join(", ")}`,
            pass: false,
            detail:
              "no successful update_section call and no live diff for this section",
          });
        }
      }
    }

    if (exp.mustNotChangeFields?.length) {
      for (const field of exp.mustNotChangeFields) {
        const changed = diff.changedFields.includes(field);
        checks.push({
          category: "state-restraint",
          name: `Section "${exp.section}" field "${field}" did not change`,
          pass: !changed,
          detail: changed ? "field changed unexpectedly" : "unchanged",
        });
      }
    }
  }

  // 5. Response content — substring assertions.
  if (caseDef.responseAssertions) {
    const ra = caseDef.responseAssertions;
    const text = run.agentText;
    const textLower = text.toLowerCase();

    for (const phrase of ra.mustContain ?? []) {
      checks.push({
        category: "response-content",
        name: `Response contains "${phrase}"`,
        pass: textLower.includes(phrase.toLowerCase()),
        detail: textLower.includes(phrase.toLowerCase())
          ? "found"
          : `not found in: ${text.slice(0, 140)}${text.length > 140 ? "…" : ""}`,
      });
    }

    for (const phrase of ra.mustNotContain ?? []) {
      checks.push({
        category: "response-content",
        name: `Response avoids "${phrase}"`,
        pass: !textLower.includes(phrase.toLowerCase()),
        detail: textLower.includes(phrase.toLowerCase())
          ? `unexpectedly contained "${phrase}"`
          : "absent",
      });
    }

    if (ra.mustBeRefusalOrClarification) {
      checks.push({
        category: "refusal",
        name: "Response is a refusal or clarification request",
        pass: isRefusalOrClarification(text),
        detail: isRefusalOrClarification(text)
          ? "matched refusal/clarification cues"
          : `no refusal cues found: ${text.slice(0, 140)}${text.length > 140 ? "…" : ""}`,
      });
    }

    if (ra.numbersMustComeFromTools) {
      // Find any number > 2 digits in the response.
      const numbers = Array.from(text.matchAll(/\b(\d{3,})\b/g)).map((m) => m[1]);
      // Concatenate all tool outputs into a searchable corpus.
      const toolCorpus = run.toolCalls
        .map((call) => JSON.stringify(call.output ?? ""))
        .join(" ");
      const unsourced = numbers.filter((n) => !toolCorpus.includes(n));
      checks.push({
        category: "response-content",
        name: "All large numbers in the response came from tool outputs",
        pass: unsourced.length === 0,
        detail:
          unsourced.length === 0
            ? "no unsourced numbers"
            : `unsourced numbers in response: ${unsourced.join(", ")}`,
      });
    }
  }

  const failures = checks.filter((c) => !c.pass);
  return {
    caseId: caseDef.id,
    pass: failures.length === 0,
    checks,
    failures,
  };
}
