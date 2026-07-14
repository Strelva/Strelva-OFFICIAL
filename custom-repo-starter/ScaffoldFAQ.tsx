/**
 * Scaffold Web FAQ section for custom-repo client sites.
 *
 * Renders a visible, accessible FAQ block AND emits a single
 * <script type="application/ld+json"> FAQPage schema. Both matter:
 *   - The FAQPage JSON-LD is what our OWN audit engine grades ("AI-answer
 *     content (FAQ/HowTo)", a HIGH-priority AI-readability check) — a site
 *     without it is marked down, and it's the #1 recurring gap across builds.
 *   - The visible <details>/<summary> block answers the questions customers
 *     actually ask, so AI assistants (and Google) quote YOU instead of a
 *     competitor.
 *
 * Server-safe on purpose: NO "use client". Native <details>/<summary> gives
 * accessible, no-JS disclosure, so no client bundle ships for it. Self-contained
 * (imports only React) — the same single-file drop-in contract the other starter
 * components follow.
 *
 * Honesty rule: with no real Q&A pairs it renders NOTHING (returns null) — it
 * never emits an empty FAQPage or placeholder questions (the audit wouldn't
 * credit an empty FAQ anyway, and a fake FAQ is worse than none).
 *
 * Usage (server component — a page or the homepage):
 *
 *   import { ScaffoldFAQ } from "@/components/ScaffoldFAQ";
 *
 *   <ScaffoldFAQ
 *     headline="Frequently Asked Questions"
 *     faqs={[
 *       { question: "Do you need to mount it to the wall?", answer: "No — the Aide·ing Arm is fully portable and needs no wall-mounting or tension rods." },
 *       { question: "What's your warranty?", answer: "Every unit ships with a 1-year guarantee." },
 *     ]}
 *   />
 */

import type { ReactElement } from "react";

export interface ScaffoldFAQItem {
  question: string;
  answer: string;
}

export interface ScaffoldFAQProps {
  faqs: ScaffoldFAQItem[];
  /** Section heading. Defaults to "Frequently Asked Questions". */
  headline?: string;
  /** Small eyebrow label above the heading (e.g. "FAQ"). Optional. */
  sectionLabel?: string;
  /** Intro line under the heading. Optional. */
  description?: string;
  /** Anchor id for the section (e.g. "faq"). Optional. */
  id?: string;
  /** Extra classes for the outer <section>, so the client repo styles it. */
  className?: string;
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Keep only Q&A pairs where BOTH sides have real text. */
export function validPairs(faqs: ScaffoldFAQItem[] | undefined): ScaffoldFAQItem[] {
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((f) => ({ question: clean(f?.question), answer: clean(f?.answer) }))
    .filter((f) => f.question.length > 0 && f.answer.length > 0);
}

/** The schema.org FAQPage object graded by the audit engine's AI-readability check. */
export function buildFaqSchema(pairs: ScaffoldFAQItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function ScaffoldFAQ(props: ScaffoldFAQProps): ReactElement | null {
  const pairs = validPairs(props.faqs);
  if (pairs.length === 0) return null;

  const headline = clean(props.headline) || "Frequently Asked Questions";
  const sectionLabel = clean(props.sectionLabel);
  const description = clean(props.description);

  // Escape "<" so a value can never close the <script> element early (the one
  // injection vector for inline JSON-LD). JSON.stringify already escapes quotes.
  const json = JSON.stringify(buildFaqSchema(pairs)).replace(/</g, "\\u003c");

  return (
    <section id={props.id} className={props.className} aria-labelledby="scaffold-faq-heading">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      {sectionLabel ? <p className="scaffold-faq__label">{sectionLabel}</p> : null}
      <h2 id="scaffold-faq-heading" className="scaffold-faq__headline">
        {headline}
      </h2>
      {description ? <p className="scaffold-faq__description">{description}</p> : null}
      <div className="scaffold-faq__list">
        {pairs.map((f, i) => (
          <details key={i} className="scaffold-faq__item">
            <summary className="scaffold-faq__question">{f.question}</summary>
            <div className="scaffold-faq__answer">{f.answer}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
