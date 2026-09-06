/**
 * AI Visibility Score — Strelva's proof-of-magic.
 *
 * One input (a business) -> one wow ("you're invisible to AI search", A-F).
 *
 * Two signal sources:
 *   1. READINESS (deterministic, no API key) — can AI even read & understand this
 *      site? Crawler access (GPTBot/PerplexityBot/Google-Extended), structured data,
 *      entity/NAP clarity, answer-format content. Runs anywhere, instantly.
 *   2. CITATION (live, needs GOOGLE_GENERATIVE_AI_API_KEY) — when a buyer asks an AI
 *      "best {category} in {city}?", does this business actually get named/recommended?
 *      This is the visceral wow. Degrades gracefully to readiness-only without a key.
 *
 * Honest-surface rule: we NEVER claim "AI doesn't recommend you" unless the live
 * citation probe actually ran. Without a key, the verdict is readiness-framed only.
 */

import * as cheerio from "cheerio";
import { validateUrlSafety } from "@/lib/audit/checks";
import { fetchPinnedPublicText } from "@/lib/pinned-public-text";
import type { AiVisibilityResult, CitationProbe, Grade, MeasurementStatus, ScoreInput, Signal } from "./contracts";

export type { AiVisibilityResult, CitationProbe, ScoreInput, Signal } from "./contracts";
export type { Grade } from "./contracts";

const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
];

export function gradeFor(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const MAX_PAGE_BYTES = 1_000_000;
const MAX_ROBOTS_BYTES = 256_000;

/**
 * Fetch text from a public HTTP(S) URL without allowing fetch to follow an
 * unvalidated redirect. Every hop is resolved by `validateUrlSafety` before
 * the request is sent. The timeout covers headers and body consumption, and
 * the body cap prevents an unbounded response allocation.
 *
 * This is an application egress guard, not a network sandbox. Production
 * infrastructure should also deny private/link-local destinations at egress.
 */
export async function fetchPublicText(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<string | null> {
  return fetchPinnedPublicText(url, {
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes ?? MAX_PAGE_BYTES,
    userAgent: "StrelvaAIVisibilityBot/0.1 (+https://strelva.com)",
  });
}

/** True if robots.txt disallows the whole site (`Disallow: /`) for any AI
 *  crawler or for `*`. Follows robots grouping properly: consecutive
 *  User-agent lines share one rule block, and any directive ends the block so a
 *  following User-agent starts a new one — blank-line separators are NOT
 *  required (the old version assumed they were). Inline `#` comments stripped. */
function aiCrawlersBlocked(robots: string): { blocked: boolean; who: string[] } {
  const isAiOrWildcard = (ua: string) =>
    ua === "*" || AI_BOTS.some((b) => b.toLowerCase() === ua.toLowerCase());
  const blocked = new Set<string>();
  let group: string[] = []; // user-agents (original case) in the current block
  let sawRule = false; // seen a directive since the last User-agent line?

  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split("#")[0]!.trim();
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      if (sawRule) { group = []; sawRule = false; } // a UA after rules = new block
      group.push(value);
    } else {
      sawRule = true; // disallow/allow/crawl-delay/sitemap all close the UA list
      if (key === "disallow" && value === "/") {
        for (const ua of group) if (isAiOrWildcard(ua)) blocked.add(ua);
      }
    }
  }
  const who = [...blocked];
  return { blocked: who.length > 0, who };
}

function readinessSignals(html: string, robots: string | null, _input: ScoreInput): Signal[] {
  const $ = cheerio.load(html);
  const signals: Signal[] = [];

  // 1) AI crawler access (heaviest — blocking AI is self-inflicted invisibility)
  if (robots) {
    const { blocked, who } = aiCrawlersBlocked(robots);
    signals.push({
      id: "ai_crawlers",
      label: "AI crawlers allowed",
      pass: !blocked,
      weight: 28,
      detail: blocked
        ? `robots.txt blocks AI crawlers (${who.join(", ")}). You've told AI not to read you`
        : "robots.txt does not block AI crawlers",
    });
  } else {
    signals.push({
      id: "ai_crawlers",
      label: "AI crawlers allowed",
      pass: true,
      weight: 28,
      detail: "No robots.txt found. AI crawlers are not blocked (default allow)",
    });
  }

  // 2) Structured data (schema.org JSON-LD) — how AI reads facts about you
  const ldBlocks = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).contents().text())
    .get();
  const schemaTypes: string[] = [];
  for (const block of ldBlocks) {
    try {
      const parsed = JSON.parse(block);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        const t = node?.["@type"];
        if (typeof t === "string") schemaTypes.push(t);
        else if (Array.isArray(t)) schemaTypes.push(...t.filter((x) => typeof x === "string"));
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  const businessSchema = schemaTypes.some((t) =>
    /LocalBusiness|Organization|Store|Restaurant|ProfessionalService|Dentist|HVACBusiness|Plumber|Electrician/i.test(t),
  );
  signals.push({
    id: "structured_data",
    label: "Structured data (schema.org)",
    pass: businessSchema,
    weight: 24,
    detail: businessSchema
      ? `Found schema.org types: ${Array.from(new Set(schemaTypes)).slice(0, 4).join(", ")}`
      : ldBlocks.length
        ? "Has JSON-LD but no business/LocalBusiness type AI can ground on"
        : "No schema.org structured data. AI has no machine-readable facts about you",
  });

  // 3) Entity / NAP clarity (name, address, phone)
  // Strip script/style/noscript/template to avoid matching phone-like patterns
  // inside inline JS (e.g. numeric literals, obfuscated code).
  const $clone = $.root().clone();
  $clone.find("script, style, noscript, template").remove();
  const bodyEl = $clone.find("body");
  const text = (bodyEl.length ? bodyEl.text() : $clone.text()).replace(/\s+/g, " ").trim();
  const hasPhone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  const hasAddress = /\b\d{1,5}\s+\w+(\s\w+){0,3}\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|suite|ste)\b/i.test(
    text,
  );
  const napPass = hasPhone && hasAddress;
  signals.push({
    id: "nap",
    label: "Name / address / phone present",
    pass: napPass,
    weight: 16,
    detail: napPass
      ? "Phone and address are present for AI to attribute"
      : `Missing ${[!hasPhone ? "phone" : "", !hasAddress ? "address" : ""].filter(Boolean).join(" & ")}. AI can't confirm who/where you are`,
  });

  // 4) Answer-format content (FAQ / Q&A AI can lift into an answer)
  const faqSchema = schemaTypes.some((t) => /FAQPage|QAPage|Question/i.test(t));
  const headings = $("h1,h2,h3")
    .map((_, el) => $(el).text().trim())
    .get();
  const questionHeadings = headings.filter((h) => /\?$/.test(h) || /^(how|what|why|when|where|do|can|is|are)\b/i.test(h));
  const answerable = faqSchema || questionHeadings.length >= 2;
  signals.push({
    id: "answerable",
    label: "Answer-format content",
    pass: answerable,
    weight: 16,
    detail: answerable
      ? "Has FAQ / question-style content AI can quote in an answer"
      : "No FAQ or question-style content for AI to lift into a response",
  });

  // 5) Clear title + description (entity identity)
  const title = $("title").first().text().trim();
  const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const titledPass = title.length >= 10 && desc.length >= 30;
  signals.push({
    id: "identity",
    label: "Clear title & description",
    pass: titledPass,
    weight: 16,
    detail: titledPass ? "Title and meta description identify the business" : "Weak/missing title or meta description",
  });

  return signals;
}

/** Live citation probe via Gemini. Returns probed:false if no key / on error. */
async function citationProbe(input: ScoreInput): Promise<CitationProbe> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return {
      probed: false,
      mentioned: false,
      recommended: false,
      note: "A live Gemini citation check was not available for this run.",
    };
  }
  try {
    const { google } = await import("@ai-sdk/google");
    const { generateText } = await import("ai");
    const where = input.location ? ` in ${input.location}` : "";
    const what = input.category ?? "businesses";
    const prompt =
      `You are a consumer assistant. Question: "What are the best ${what}${where}? List specific named businesses you'd recommend."\n` +
      `Answer naturally with specific business names. Then on a final line output strict JSON: ` +
      `{"names":[".."]} listing every business you named.`;
    const { text } = await generateText({ model: google("gemini-2.5-flash"), prompt });
    const named = text.toLowerCase();
    // Use word-boundary matching to avoid false positives where the business
    // name appears as a substring of another word (e.g. "Ace" inside "Acera").
    const escapedBusiness = input.business.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentioned = new RegExp(`(?<![a-z0-9])${escapedBusiness}(?![a-z0-9])`, "i").test(named);
    return {
      probed: true,
      mentioned,
      recommended: mentioned, // if it surfaced in a "best/recommend" answer, treat as recommended
      note: mentioned
        ? `Gemini named "${input.business}" when asked for the best ${what}${where}.`
        : `Gemini did not name "${input.business}" when asked for the best ${what}${where}.`,
    };
  } catch {
    return {
      probed: false,
      mentioned: false,
      recommended: false,
      note: "The live Gemini citation check could not be completed for this run.",
    };
  }
}

export async function scoreAiVisibility(input: ScoreInput): Promise<AiVisibilityResult> {
  let signals: Signal[] = [];
  let url: string | undefined;

  if (input.url) {
    url = normalizeUrl(input.url);
    // SSRF protection: validate the URL resolves to a public IP before any fetch,
    // matching the same guard used by runAudit in src/lib/audit/checks.ts.
    try {
      await validateUrlSafety(url);
    } catch {
      // Treat SSRF-blocked URLs as unfetchable — degrade to no signals.
      url = undefined;
    }
  }

  if (url) {
    const origin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return undefined;
      }
    })();
    const [html, robots] = await Promise.all([
      fetchPublicText(url),
      origin ? fetchPublicText(`${origin}/robots.txt`, { timeoutMs: 5_000, maxBytes: MAX_ROBOTS_BYTES }) : Promise.resolve(null),
    ]);
    if (html) signals = readinessSignals(html, robots, input);
  }

  const citation = await citationProbe(input);

  // Readiness sub-score (0..1)
  const totalW = signals.reduce((s, x) => s + x.weight, 0) || 1;
  const gotW = signals.reduce((s, x) => s + (x.pass ? x.weight : 0), 0);
  const readiness = signals.length ? gotW / totalW : 0;

  // Combine. With a live probe, citation carries 50%; else readiness is the whole score.
  let score: number;
  if (citation.probed) {
    const citationScore = citation.mentioned ? 1 : 0;
    score = Math.round((readiness * 0.5 + citationScore * 0.5) * 100);
  } else if (signals.length) {
    score = Math.round(readiness * 100);
  } else {
    score = 0;
  }
  const grade = gradeFor(score);
  const measurementStatus: MeasurementStatus =
    signals.length > 0 && citation.probed
      ? "measured"
      : signals.length > 0 || citation.probed
        ? "partial"
        : "unavailable";
  const measurementNote =
    measurementStatus === "measured"
      ? "Website readiness and one live Gemini citation answer were measured."
      : measurementStatus === "partial" && signals.length > 0
        ? "Website readiness was measured. A live Gemini citation answer was not available."
        : measurementStatus === "partial"
          ? "One live Gemini citation answer was measured. Website readiness could not be measured."
          : "This run could not measure website readiness or a live Gemini citation answer.";

  // Honest verdict: only invoke "AI doesn't recommend you" when actually probed.
  let verdict: string;
  if (measurementStatus === "unavailable") {
    verdict = `We couldn't measure ${input.business} on this run, so no visibility grade was produced.`;
  } else if (citation.probed && !citation.mentioned && signals.length === 0) {
    verdict = `Gemini did not name ${input.business} in one live answer. Website readiness could not be measured.`;
  } else if (citation.probed && citation.mentioned && signals.length === 0) {
    verdict = `Gemini named ${input.business} in one live answer. Website readiness could not be measured.`;
  } else if (citation.probed && !citation.mentioned) {
    verdict = `Gemini did not name ${input.business} when asked for the best ${input.category ?? "option"}.`;
  } else if (citation.probed && citation.mentioned && score < 70) {
    verdict = `Gemini named ${input.business} in one live answer. The website readiness checks found gaps that may make its facts harder to use.`;
  } else if (!citation.probed && score < 70) {
    verdict = `${input.business}'s website readiness score was ${score}/100. This run did not measure whether an AI answer names the business.`;
  } else if (!citation.probed) {
    verdict = `${input.business}'s website readiness score was ${score}/100. This run did not measure whether an AI answer names the business.`;
  } else {
    verdict = `Gemini named ${input.business} in one live answer, and the website readiness score was ${score}/100.`;
  }

  const failing = signals.filter((s) => !s.pass).sort((a, b) => b.weight - a.weight);
  const topFix = measurementStatus === "unavailable"
    ? "Try again with a reachable public website to measure AI readiness."
    : failing.length
      ? failing[0]!.detail
      : signals.length === 0
        ? "Retry the website check to measure AI readiness."
        : "Maintain structured data and AI-crawler access.";

  return {
    business: input.business,
    url,
    score,
    grade,
    verdict,
    signals,
    citation,
    topFix,
    measurementStatus,
    measurementNote,
    readinessMeasured: signals.length > 0,
  };
}
