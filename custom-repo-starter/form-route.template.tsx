/**
 * Drop-in form handler — copy to `app/api/contact/route.ts` (or any
 * `app/api/<form>/route.ts`). The self-contained Formspree replacement: it
 * emails the site owner every submission, clearly labeled, via Resend on the
 * shared `mail.strelva.com` domain. No platform tenant required.
 *
 * POST any JSON body. The handler renders EVERY field it doesn't recognize as
 * control/meta, so one route serves a contact form, a quote form, a booking
 * inquiry — whatever the site posts. Recommended body shape:
 *
 *   {
 *     "formName": "Contact",     // optional label → subject + email heading
 *     "email": "visitor@x.com",  // optional → becomes Reply-To (+ shown)
 *     "website": "",             // honeypot: hidden field, must stay empty
 *     "name": "...", "phone": "...", "message": "..."   // any real fields
 *   }
 *
 * Required env (set on the site's Vercel project):
 *   RESEND_API_KEY      a send-scoped key from the STRELVA Resend account
 *   SCAFFOLD_FORM_FROM  e.g.  McLear's Cottage <forms@mail.strelva.com>
 *   SCAFFOLD_FORM_TO    owner inbox(es), comma-separated
 *   SCAFFOLD_SITE_NAME  e.g.  McLear's Cottage   (subject prefix + email header)
 *
 * With no RESEND_API_KEY the handler logs and returns success (safe for local
 * dev / pre-launch). Never throws provider errors to the visitor.
 */
import { NextResponse } from "next/server";
import {
  normalizeSubmission,
  renderFormEmailHtml,
  renderFormEmailText,
  rateLimitOk,
} from "@/lib/scaffold-forms";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

export async function POST(req: Request) {
  try {
    if (!rateLimitOk(`form:${clientIp(req)}`)) {
      return NextResponse.json({ error: "Too many submissions. Please try again shortly." }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
    }

    // Honeypot: bots fill the hidden "website" field. Fake success so they don't
    // retry, deliver nothing.
    const honeypot = body.website;
    if (typeof honeypot === "string" && honeypot.trim() !== "") {
      return NextResponse.json({ success: true });
    }

    // Optional dwell-time gate: if the form stamped `_t` (render time in ms) and
    // the submit came < 1.5s later, it's almost certainly a bot. Fake success.
    if (typeof body._t === "number" && Date.now() - body._t < 1500) {
      return NextResponse.json({ success: true });
    }

    const { fields, replyTo } = normalizeSubmission(body);
    if (fields.length === 0) {
      return NextResponse.json({ error: "Nothing to submit." }, { status: 400 });
    }

    const siteName = process.env.SCAFFOLD_SITE_NAME || "Website";
    const formName = typeof body.formName === "string" && body.formName.trim() ? body.formName.trim().slice(0, 80) : "Website message";
    const submittedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

    // Subject states site + form + who, so it's unmistakable in the inbox.
    const nameField = fields.find(([label]) => label.toLowerCase() === "name");
    const subject = `[${siteName}] ${formName}${nameField ? ` — ${nameField[1]}` : ""}`;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.SCAFFOLD_FORM_FROM;
    const to = (process.env.SCAFFOLD_FORM_TO || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (!apiKey || !from || to.length === 0) {
      // Unconfigured (local/dev/pre-launch): log, don't fail the visitor.
      console.log(`[form] ${subject} — ${fields.map(([k, v]) => `${k}: ${v}`).join(" | ")}`);
      return NextResponse.json({ success: true });
    }

    const meta = { siteName, formName, submittedAt };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        reply_to: replyTo,
        subject,
        html: renderFormEmailHtml(meta, fields),
        text: renderFormEmailText(meta, fields),
      }),
    });

    if (!res.ok) {
      console.error("[form] Resend send failed:", res.status);
      return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Could not process your submission." }, { status: 500 });
  }
}
