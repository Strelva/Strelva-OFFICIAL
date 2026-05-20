/**
 * LLM-as-judge layer for the benchmark.
 *
 * Deterministic checks in `evaluator.ts` cover what the agent DID — which
 * tools, which sections, which fields, whether the response contains certain
 * substrings. They cannot grade tone, voice, helpfulness, or whether a
 * refusal redirects the owner usefully.
 *
 * For those, we run a smarter model as judge. By default the judge is
 * `gemini-2.5-pro` (same Google API key as the agent under test — no new
 * dependencies). Override via `BENCHMARK_JUDGE_MODEL` to test other models.
 *
 * Each rubric is one yes/no question with criteria. Judge returns a strict
 * { pass, reasoning } object via `generateObject`. One LLM call per rubric;
 * rubrics within a case fan out in parallel.
 *
 * Cost: ~$0.002 per rubric at gemini-2.5-pro. A full benchmark with rubrics
 * on ~6 cases adds well under $0.20 to a run.
 */

import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { BenchmarkCase, JudgeRubric } from "./cases";
import type { CaseRun } from "./runner";

export type { JudgeRubric };

export interface JudgeResult {
  rubricName: string;
  pass: boolean;
  reasoning: string;
  judgeModel: string;
  errored: boolean;
  errorMessage?: string;
  /** Token usage for this single judge call, if surfaced by the SDK. */
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

const judgeOutputSchema = z.object({
  pass: z.boolean(),
  reasoning: z.string().min(1).max(400),
});

function judgeModelName(): string {
  return process.env.BENCHMARK_JUDGE_MODEL || "gemini-2.5-pro";
}

function buildJudgePrompt(
  caseDef: BenchmarkCase,
  run: CaseRun,
  rubric: JudgeRubric,
): string {
  const tools = run.toolCalls
    .map(
      (call) =>
        `- step ${call.stepNumber}: ${call.name}(${JSON.stringify(call.input)}) -> success=${call.success}${
          call.error ? `, error=${call.error}` : ""
        }`,
    )
    .join("\n");

  return `You are evaluating an AI assistant that helps a small local-business owner manage their website.

The business is "Sunrise Wellness Studio" in Buffalo, NY — a one-person yoga / movement studio.
The AI's role: read and update website content, draft copy for review, refuse off-platform asks
(refunds, shipping, appointment management). It should sound warm and conversational, like a person
texting, never corporate or robotic. It should be specific to the business, not generic.

OWNER'S MESSAGE:
${JSON.stringify(caseDef.prompt)}

AI'S RESPONSE:
${JSON.stringify(run.agentText)}

TOOL CALLS THE AI MADE:
${tools || "(none)"}

EVALUATION QUESTION:
${rubric.question}

CRITERIA TO WEIGH:
${rubric.criteria.map((c) => `- ${c}`).join("\n")}

Respond as JSON with two fields:
- pass: true if the response clearly meets the criteria, false otherwise. Be strict — borderline cases fail.
- reasoning: one short sentence (under 240 chars) citing what made the call.

Do not be charitable. The benchmark exists to surface weakness.`;
}

export async function runJudgeRubric(
  caseDef: BenchmarkCase,
  run: CaseRun,
  rubric: JudgeRubric,
): Promise<JudgeResult> {
  const modelName = judgeModelName();
  try {
    const { object, usage } = await generateObject({
      model: google(modelName),
      schema: judgeOutputSchema,
      prompt: buildJudgePrompt(caseDef, run, rubric),
    });
    return {
      rubricName: rubric.name,
      pass: object.pass,
      reasoning: object.reasoning,
      judgeModel: modelName,
      errored: false,
      usage: usage
        ? {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
          }
        : undefined,
    };
  } catch (err) {
    return {
      rubricName: rubric.name,
      pass: false,
      reasoning: "Judge call failed — could not evaluate this rubric.",
      judgeModel: modelName,
      errored: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Run every rubric for a case in parallel. */
export async function runJudgeRubrics(
  caseDef: BenchmarkCase,
  run: CaseRun,
  rubrics: JudgeRubric[],
): Promise<JudgeResult[]> {
  if (rubrics.length === 0) return [];
  return Promise.all(rubrics.map((rubric) => runJudgeRubric(caseDef, run, rubric)));
}
