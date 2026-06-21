/**
 * Strelva's marketing blog / guide library.
 *
 * These are repurposed from the OWSH Systems fix guides into SEO-oriented
 * articles ("how to fix X on your website"). Strelva manages and fixes client
 * sites itself, so these are not a client self-serve deliverable — they exist
 * to rank for the problems our free audit surfaces and funnel readers into it.
 *
 * Content lives in two batch files so it can be authored in parallel without
 * collisions; this module is the single read surface the routes use.
 */
import { batch1 } from "@/content/guides/batch-1";
import { batch2 } from "@/content/guides/batch-2";

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideArticle {
  /** URL slug, e.g. "add-local-business-schema". */
  slug: string;
  /** SEO headline / H1. */
  title: string;
  /** One to two sentence summary (card text + meta description fallback). */
  excerpt: string;
  /** Display category, e.g. "AI Readability", "Performance", "Security". */
  category: string;
  difficulty: "easy" | "medium" | "hard";
  /** e.g. "5 min". */
  readingTime: string;
  /** ISO date the guide was last reviewed. */
  updatedAt: string;
  /** Article body as trusted, pre-sanitized HTML (headings, paragraphs, lists). */
  bodyHtml: string;
  /** Optional Q&A rendered as a FAQ section + FAQPage structured data. */
  faq?: GuideFaq[];
  /** Overrides `title` for the <title> tag when set. */
  seoTitle?: string;
  /** Overrides `excerpt` for the meta description when set. */
  seoDescription?: string;
  /** Audit category slug this guide helps fix, for cross-linking from results. */
  fixesSlug?: string;
}

/** All guides, newest-reviewed first. */
export const guides: GuideArticle[] = [...batch1, ...batch2].sort((a, b) =>
  a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
);

export function listGuides(): GuideArticle[] {
  return guides;
}

export function getGuide(slug: string): GuideArticle | null {
  return guides.find((g) => g.slug === slug) ?? null;
}

/** Categories present, each with its guides, for the index page grouping. */
export function guidesByCategory(): Array<{ category: string; items: GuideArticle[] }> {
  const map = new Map<string, GuideArticle[]>();
  for (const g of guides) {
    const arr = map.get(g.category) ?? [];
    arr.push(g);
    map.set(g.category, arr);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}
