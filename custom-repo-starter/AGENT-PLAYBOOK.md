# Strelva Client Site — Agent Playbook

**You are a coding agent working inside a Strelva client site repo** (a standalone Next.js App Router repo — e.g. `~/rhm-innovations`). Your job: get this site **fully wired to Strelva** and to **audit grade A**, then verify it.

**Canonical components live at** `~/strelva-platform/custom-repo-starter/` on this machine. Copy the ones named below into this repo's `src/components/` (or `src/lib/` for the helpers) and adjust import paths — don't reinvent them. Never invent business facts (phone, address, social URLs, credentials); if you don't have a real value, leave it out and list it as a gap for the human, rather than fabricating.

The operator-side journey (provisioning, domain, billing) is Noah's, documented in [`docs/client-onboarding.md`](../docs/client-onboarding.md). This playbook is **only the repo work** — Phases 2–3 of that flow.

---

## Part A — Strelva control-plane wiring (must-have)

Most of these ship from the starter and are probably already here. **Verify each; add if missing.**

1. **`ScaffoldTracker.tsx`** mounted in the root layout — page-view / booking-click / phone-click beacons → the Strelva dashboard. Needs `NEXT_PUBLIC_SCAFFOLD_API_URL` + `NEXT_PUBLIC_TENANT_ID`.
2. **`ScaffoldGA4.tsx`** mounted in the root layout — GA4 pageview tag. No-op until `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set.
3. **Capability manifest** — `app/api/capabilities/route.ts` (from `site-capabilities-route.ts`) so the Strelva AI edits what the live site actually renders.
4. **Env vars** set on the repo's Vercel project: `NEXT_PUBLIC_SCAFFOLD_API_URL` (`https://strelva.com`), `NEXT_PUBLIC_TENANT_ID` (the tenant subdomain), `NEXT_PUBLIC_GA4_MEASUREMENT_ID` (the client's GA4 id).
5. **`revalidate-route.ts`** at `app/api/revalidate/route.ts` — signed HMAC revalidation so control-plane content edits push to the live site.
6. **Forms → the owner's inbox (Formspree replacement).** If the site has a contact / quote / booking form and is NOT a full platform tenant, copy **`form-route.template.tsx`** → `app/api/contact/route.ts` and **`scaffold-forms.ts`** → `src/lib/scaffold-forms.ts`, point the form at `POST /api/contact`, and set `RESEND_API_KEY` (send-scoped key from the **Strelva** Resend account) + `SCAFFOLD_FORM_FROM` (`Business Name <forms@mail.strelva.com>`) + `SCAFFOLD_FORM_TO` (owner email) + `SCAFFOLD_SITE_NAME`. Never wire Formspree or a per-client sending domain — all client mail sends from the shared `mail.strelva.com`, branded by the from-name. (A full tenant uses `ScaffoldLeadForm.tsx` → `/api/v1/leads/{tenant}` instead — see README "Forms".)

**Done when:** the site builds, the tracker + GA4 tags are in the rendered `<head>`/layout, `/api/capabilities` returns a manifest, and any form POSTs a real owner-notification email (or logs when the Resend env is unset).

---

## Part B — Audit-passing fixes (grade A)

These are the recurring gaps our audit engine grades every site on. For each: what the audit checks, and exactly what to add.

### B1. FAQ + FAQPage schema — HIGH priority, #1 gap
The audit grades **FAQPage JSON-LD**, not just visible text. Copy **`ScaffoldFAQ.tsx`** and render it on the homepage with **real** Q&A for this business (installation, warranty, pricing, shipping, who it's for, hours — whatever customers actually ask). It emits the FAQPage schema AND a visible `<details>` block. Renders nothing if you give it no real pairs, so write genuine answers.

### B2. `llms.txt` — HIGH signal
Add `app/llms.txt/route.ts` from **`llms-route.template.tsx`** (uses `buildLlmsTxt` from `scaffold-seo.ts`). Fill in the real business summary + key page links. Keep it `force-static` and never-throw — a 500 here is worse than a 404.

### B3. Security headers
Copy **`scaffold-headers.ts`** and wire `scaffoldSecurityHeaders()` into `next.config.ts`'s `async headers()` for `source: "/(.*)"`. Ships 5 safe headers by default. Add a Content-Security-Policy via the `contentSecurityPolicy` option **only** once you've confirmed every asset origin the site loads (a wrong CSP silently breaks the page — start with the 5, add CSP deliberately).

### B4. LocalBusiness schema + `sameAs`
Ensure **`ScaffoldLocalBusinessSchema.tsx`** is rendered (root layout) with the business's real name, phone, address, hours, and **`sameAs`** = the client's actual Google Business / Facebook / Instagram / LinkedIn profile URLs. More real profiles = stronger AI-trust score. Use only URLs you can confirm.

### B5. Reviews / social proof
If the client has reviews, render **`ScaffoldReviews.tsx`** with real ones. The audit rewards visible testimonials; don't fabricate any.

### B6. Content/markup gaps (no component — edit the site)
- **Team / About link** — add an About or Team page/link showing the people behind the business.
- **Trust & credentials** — surface real certifications, licensing, insurance, warranty, guarantees as visible text/badges.
- **Complete contact info** — visible **address, email, hours** (not just a phone number), ideally in the footer.
- **Form labels** — every form field needs a `<label>` (screen-reader + audit accessibility check). Check `ScaffoldLeadForm` and any custom forms.
- **Privacy & Terms links** + a cookie-consent notice if the site sets non-essential cookies.

---

## What needs a human (agents: flag these, NEVER fabricate)

Some audit items can only be fixed with real business data an agent cannot know or invent. **Do not guess, relabel, or manufacture these** — add them only when given a real value, otherwise leave them out and list them in your report as a gap for the human:

- **Social profiles (`sameAs`)** — real Google Business / Facebook / Instagram / LinkedIn / X URLs. If the business has none, omit `sameAs` entirely.
- **Testimonials / reviews** — real customer quotes only. A founder quote is not a testimonial; never relabel or invent one.
- **Phone / click-to-call** — **many businesses legitimately have no phone number** (Strelva itself does not, and won't anytime soon). If there's no real number, **do NOT invent one** — leave click-to-call out and accept the small Trust-Signals score hit. Lead with email / the contact form instead.

**Grade target, honestly stated:** aim for **A**, but a site can be legitimately capped below A when real data genuinely doesn't exist yet (no socials, no phone, no testimonials). That's a "the human must go create these" outcome, not a "fabricate to pass" one. Report the ceiling and exactly what real data would lift it, and stop there.

## Part C — Verify

Self-checks you can run from inside the repo against the live/preview URL (`$U`):

```bash
U=https://<this-site-or-vercel-build-url>
curl -s "$U/llms.txt" -o /dev/null -w "llms.txt: %{http_code}\n"          # want 200
curl -sI "$U" | grep -icE "content-security-policy|x-frame-options|strict-transport|referrer-policy|permissions-policy|x-content-type"  # want 5-6
curl -s "$U" | grep -oE '"@type":"FAQPage"' | head -1                      # want a match
curl -s "$U" | grep -oE '"sameAs":\[[^]]*\]' | head -1                      # want the real profiles
```

**The real grade check (operator, from `~/strelva-platform`):** `pnpm audit:full $U` — target **grade A**. Report the grade and any remaining findings back to the human; note any gap you couldn't fill because you lacked a real value (a social URL, a credential, a review).

---

## Task checklist (work top to bottom)

- [ ] A1 ScaffoldTracker mounted · A2 ScaffoldGA4 mounted · A3 `/api/capabilities` · A4 env vars · A5 revalidate route · A6 forms → owner email (if the site has a form)
- [ ] B1 ScaffoldFAQ with real Q&A (FAQPage schema renders)
- [ ] B2 `/llms.txt` route returns real content, 200
- [ ] B3 security headers in `next.config.ts`
- [ ] B4 LocalBusiness schema with real `sameAs`
- [ ] B5 Reviews rendered (if any real ones)
- [ ] B6 Team/About link · trust/credentials · full contact info · form labels · privacy/terms
- [ ] C build passes, self-checks green, and `pnpm audit:full` returns **A** — or the honest ceiling with every real-data gap (socials / phone / testimonials) reported to the human
