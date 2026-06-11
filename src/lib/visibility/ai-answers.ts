/**
 * AI-answer visibility probe for emergency-intent queries.
 *
 * Reuses the same Gemini setup as scripts/ai-visibility.ts (citationProbe).
 *
 * Honesty rails (baked in):
 * - This measures ONE model's answer at ONE point in time, not all AI surfaces.
 * - probed:false is always returned when no API key is configured or on error.
 * - Never claims a competitor is absent unless the probe actually ran and
 *   returned a verifiable answer.
 * - methodologyNote is always populated so downstream callers can include it.
 *
 * Cost: one Gemini call per query. At default 3 queries/tenant/week that is
 * 12 calls/month. Gemini 2.5 Flash is priced at ~$0.15/1M input tokens;
 * each prompt is ~200 tokens — negligible cost (<$0.001/tenant/month).
 */

export interface AiAnswerResult {
  query: string;
  /** Which AI model was asked (e.g. "gemini-2.5-flash") */
  model: string;
  /** true when the probe actually ran (key present, no error) */
  probed: boolean;
  /** true if the tenant business name appeared in the answer */
  tenantMentioned: boolean;
  competitors: Array<{
    name: string;
    mentioned: boolean;
  }>;
  checkedAt: string;
  skipReason?: string;
  /** Always present: surfaces the methodology so report copy is honest */
  methodologyNote: string;
}

const MODEL_ID = "gemini-2.5-flash";
const METHODOLOGY =
  `Checked via ${MODEL_ID} at one point in time. AI answers vary by model, ` +
  `location, and session — this is a directional signal, not a definitive rank.`;

function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function isMentioned(answer: string, name: string): boolean {
  const norm = normaliseName(answer);
  const key = normaliseName(name);
  // Match on the first two meaningful words to avoid over-matching very short names
  const words = key.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return norm.includes(key);
  // All first-two words must appear (loose but avoids false negatives on abbreviations)
  const check = words.slice(0, 2);
  return check.every((w) => norm.includes(w));
}

export async function probeAiAnswer(
  query: string,
  tenantName: string,
  competitors: Array<{ name: string }>,
): Promise<AiAnswerResult> {
  const checkedAt = new Date().toISOString();

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      query,
      model: MODEL_ID,
      probed: false,
      tenantMentioned: false,
      competitors: competitors.map((c) => ({ name: c.name, mentioned: false })),
      checkedAt,
      skipReason: "GOOGLE_GENERATIVE_AI_API_KEY not configured",
      methodologyNote: METHODOLOGY,
    };
  }

  try {
    const { google } = await import("@ai-sdk/google");
    const { generateText } = await import("ai");

    const prompt =
      `You are a consumer assistant helping someone in an emergency. ` +
      `Question: "${query}" ` +
      `List specific named local businesses you would recommend. ` +
      `Be concrete — name actual businesses. ` +
      `Then on a final line output strict JSON: {"names":["..."]} listing every business you named.`;

    const { text } = await generateText({
      model: google(MODEL_ID),
      prompt,
    });

    const tenantMentioned = isMentioned(text, tenantName);
    const competitorResults = competitors.map((c) => ({
      name: c.name,
      mentioned: isMentioned(text, c.name),
    }));

    return {
      query,
      model: MODEL_ID,
      probed: true,
      tenantMentioned,
      competitors: competitorResults,
      checkedAt,
      methodologyNote: METHODOLOGY,
    };
  } catch (err) {
    return {
      query,
      model: MODEL_ID,
      probed: false,
      tenantMentioned: false,
      competitors: competitors.map((c) => ({ name: c.name, mentioned: false })),
      checkedAt,
      skipReason: `Probe error: ${err instanceof Error ? err.message : String(err)}`,
      methodologyNote: METHODOLOGY,
    };
  }
}

/**
 * Build a set of emergency-intent queries from tenant visibility config.
 * Keeps the count at or below maxQueries to bound API cost.
 */
export function buildVisibilityQueries(
  trade: string,
  towns: string[],
  maxQueries = 3
): string[] {
  const templates = [
    (town: string) => `emergency ${trade} in ${town}`,
    (town: string) => `${trade} near me ${town}`,
    (town: string) => `${trade} repair ${town}`,
  ];

  const queries: string[] = [];
  for (const town of towns) {
    for (const tpl of templates) {
      if (queries.length >= maxQueries) return queries;
      queries.push(tpl(town));
    }
  }
  return queries;
}
