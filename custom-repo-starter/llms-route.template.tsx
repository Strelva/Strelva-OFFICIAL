/**
 * Drop-in for `app/llms.txt/route.ts` in a client repo.
 *
 * Serves an llms.txt (llmstxt.org) at the site root — the plain-text guide AI
 * assistants read to learn what the site is and where the key pages are. Our
 * audit engine credits a site that publishes one; it's a recurring gap across
 * builds, so ship this on every repo.
 *
 * `force-static` makes it a cheap CDN file (no per-request compute). Keep it
 * SIMPLE and never throw — a client site's llms.txt that 500s is worse than a
 * 404 (it reads as a broken route). Fill in the real business summary + pages.
 *
 * Adjust the import path to wherever `scaffold-seo.ts` lives in the repo.
 */

import { buildLlmsTxt } from "@/lib/scaffold-seo";

export const dynamic = "force-static";

const SITE_URL = "https://example.com";

export function GET(): Response {
  const body = buildLlmsTxt({
    siteName: "Business Name",
    description: "One-line summary of what the business does and who it's for.",
    sections: [
      {
        title: "Pages",
        links: [
          { title: "Home", url: `${SITE_URL}/`, description: "Overview and how to get started." },
          { title: "Contact", url: `${SITE_URL}/contact`, description: "Reach the business." },
        ],
      },
    ],
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
