import { NextResponse } from "next/server";
import { isRateLimitedWindowedAsync, rateLimitKey } from "@/lib/rate-limit";
import { sendNewIntakeLeadEmail } from "@/lib/delivery-email";
import { recordLead } from "@/lib/leads";

/**
 * Lead-magnet capture for the public /audit tool. A prospect unlocks the full
 * report by giving their email; we record the lead and notify the team so it's
 * followed up, then the client opens the report inline. No prospect email is
 * sent here (that path is behind the platform email pause) — the team
 * notification (operator-gated, ON by default, defaults to jacob@) is what makes
 * this a real inbound funnel today.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 120);
  }
}

export async function POST(req: Request) {
  // Tighter than a page view: a form submit with an email. 8/hour per IP.
  if (await isRateLimitedWindowedAsync(rateLimitKey(req, "audit-lead"), 8, 3600_000)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  let body: { url?: string; email?: string; grade?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!url) return NextResponse.json({ error: "A site URL is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  const host = hostOf(url);
  const scoreLine = body.grade ? `Grade ${body.grade}${typeof body.score === "number" ? ` (${body.score}/100)` : ""}` : "";

  // Persist (best-effort) under a platform audit bucket, and notify the team.
  // Both are isolated so a failure in one never blocks the capture response.
  await recordLead("audit", {
    name: host,
    email,
    message: `Ran the free audit for ${url}. ${scoreLine}`.trim(),
    source: "audit-magnet",
  }).catch(() => null);

  await sendNewIntakeLeadEmail({
    lead: {
      businessName: host,
      email,
      currentWebsite: url,
      description: `Ran the free site audit and unlocked the full report. ${scoreLine}`.trim(),
      planLabel: "Audit lead (unlocked report)",
    },
    leadsUrl: "https://admin.strelva.com/admin/leads",
    logPrefix: "[audit-lead]",
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
