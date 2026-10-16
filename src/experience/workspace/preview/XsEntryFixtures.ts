/**
 * Fictional fixtures for the XA entry lane previews (getting back in, the
 * free check, the claim). Harbor Dental and North Studio are the board's
 * fictional business and agency; no address or email here is real.
 */
import type { AuditResult } from "@/lib/audit/types";
import type { AiVisibilityResult } from "@/products/ai-visibility/client";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { XA_HARBOR, XA_NORTH } from "./xa-day";

export const XS_OWNER = { name: XA_HARBOR.owner, email: "dr.lin@harbordental.com" } as const;
export const XS_BUSINESS = { name: XA_HARBOR.name, site: "https://harbordental.com", address: "1180 Elmwood Ave, Buffalo" } as const;

export const XS_NORTH_STUDIO: OwnerBrand = { agencyId: "22222222-2222-4222-8222-222222222222", name: XA_NORTH.name, logoUrl: null, accentColor: "#2f5236", replyTo: "maya@northstudio.example", credit: "runs_on_strelva" };
export const XS_IDENTITY_UNAVAILABLE: OwnerBrand = { agencyId: null, name: "Agency identity unavailable", logoUrl: null, accentColor: "#565d64", replyTo: null, credit: "runs_on_strelva" };

export const XS_AGENCY: AgencyAttribution = {
  workspaceId: XS_NORTH_STUDIO.agencyId!, slug: "north-studio", name: XA_NORTH.name,
  contactUrl: "https://northstudio.example/contact?from=check", brand: { logoUrl: null, accentColor: "#2f5236" }, replyTo: "maya@northstudio.example",
};

export const XS_BUSINESSES = [
  { id: "harbor-dental", name: XA_HARBOR.name, site: XA_HARBOR.domain, waiting: 1, href: "/preview/strelva/xa/xs-entry/no-access" },
  { id: "elmwood-ortho", name: "Elmwood Orthodontics", site: "elmwoodortho.com", href: "/preview/strelva/xa/xs-entry/no-access" },
  { id: "lakeview-yoga", name: "Lakeview Yoga", site: null, href: "/preview/strelva/xa/xs-entry/no-access" },
] as const;

export function xsAudit(agency?: AgencyAttribution): AuditResult {
  return {
    businessName: XA_HARBOR.name, agency, url: "https://harbordental.com/", scannedAt: "2026-11-23T19:14:00.000Z", overallScore: 62, grade: "C",
    categories: [
      { name: "Search", slug: "seo", weight: 25, score: 58, guides: [{ slug: "local-seo-basics", title: "Local search basics" }], checks: [
        { name: "Opening hours in structured data", status: "fail", score: 0, priority: "high", message: "Your hours appear only as an image, so search engines and assistants can't read them.", impact: "People asking “is Harbor Dental open Saturday” get no answer from your site." },
        { name: "Page titles", status: "warn", score: 60, priority: "medium", message: "Three pages share the title “Home”.", impact: "Search results show the same line for different pages." },
        { name: "Sitemap", status: "pass", score: 100, message: "Found at /sitemap.xml with 14 pages." },
      ] },
      { name: "Speed", slug: "performance", weight: 25, score: 71, checks: [
        { name: "Largest image", status: "warn", score: 55, priority: "medium", message: "The home page photo is 4.1 MB.", impact: "Phones on cellular wait about three seconds before the page appears." },
        { name: "Server response", status: "pass", score: 100, message: "First byte in 180 ms." },
      ] },
      { name: "Phones", slug: "mobile", weight: 20, score: 90, checks: [
        { name: "Tap targets", status: "pass", score: 100, message: "Buttons are large enough to tap." },
        { name: "Phone number link", status: "warn", score: 70, priority: "low", message: "(716) 555-0142 is plain text, not a tap-to-call link." },
      ] },
      { name: "Security", slug: "security", weight: 15, score: 100, checks: [
        { name: "HTTPS", status: "pass", score: 100, message: "Every page loads over HTTPS." },
      ] },
      { name: "Accessibility", slug: "accessibility", weight: 15, score: 40, checks: [
        { name: "Image descriptions", status: "fail", score: 20, priority: "high", message: "11 of 14 images have no description.", impact: "Screen readers announce “image” with nothing else." },
      ] },
    ],
  };
}

export function xsAi(agency?: AgencyAttribution): AiVisibilityResult {
  return {
    agency, business: XA_HARBOR.name, url: "https://harbordental.com", score: 64, grade: "C", measurementStatus: "measured", readinessMeasured: true,
    verdict: "Gemini found the practice but not its hours or services.",
    citation: { probed: true, mentioned: true, recommended: false, note: "Gemini named Harbor Dental for “family dentist on Elmwood Ave in Buffalo” but did not recommend it." },
    topFix: "Put your opening hours on the site as text, not an image, so Gemini can answer “are you open Saturday”.",
    signals: [
      { id: "name", label: "Business name", pass: true, detail: "Read from the page title and header.", weight: 10 },
      { id: "address", label: "Address", pass: true, detail: "1180 Elmwood Ave, Buffalo, on /contact.", weight: 10 },
      { id: "phone", label: "Phone", pass: true, detail: "(716) 555-0142 on every page.", weight: 10 },
      { id: "hours", label: "Hours", pass: false, detail: "Shown only inside an image.", weight: 20 },
      { id: "services", label: "Services", pass: false, detail: "No page lists services as text.", weight: 20 },
    ],
  };
}

export const XS_REPORT_ID = `audit_${"a".repeat(32)}`;
export const XS_SCAN_ID = `scan_${"b".repeat(32)}`;
