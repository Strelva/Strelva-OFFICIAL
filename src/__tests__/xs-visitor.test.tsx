import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { VisitorBookingLoading } from "@/experience/bookings/VisitorBookingLoading";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";
import { SiteLinks } from "@/components/public/SiteLinks";
import { SiteBlogIndex } from "@/components/public/SiteBlog";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { visitorNewsletterMail } from "@/platform/infra/email/visitor-mail";
import { renderXaMailHtml } from "@/platform/infra/email/xa-mail";
import { customerReminderEmail, requestLapsedEmail } from "@/platform/bookings/emails";
import { confirmState, harborLinks, harborSite, manageState, offerState, previewBooking } from "@/experience/workspace/preview/xs-visitor-fixture";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { sitePageTree, SITE_CATALOG_CSS, type SiteTree } from "@/products/websites/site-render-tree";
import { ownerRequestReminderEmail } from "@/platform/bookings/emails";
import { readFileSync } from "node:fs";

const text = (tree: SiteTree): string => typeof tree === "string" ? tree : `<${tree.tag} ${Object.entries(tree.attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}>${tree.children.map(text).join("")}</${tree.tag}>`;

const primaries = (html: string) => (html.match(/data-xa-primary/g) ?? []).length;

describe("xs-visitor: what a business's visitors see", () => {
  it("renders a customer email in XA without changing its options or plain text", () => {
    const options: EmailOptions = { businessName: "Harbor Dental", heading: "We received your message", paragraphs: ["Hi Jordan, thanks."], rows: [{ label: "Your message", value: "Saturday?" }] };
    const before = JSON.stringify(options);
    const html = renderEmailHtml(options);
    expect(JSON.stringify(options)).toBe(before);
    expect(html).toContain("Harbor Dental"); expect(html).toContain("Runs on Strelva"); expect(html).toContain("Saturday?");
    expect(html).not.toMatch(/monospace|Geist Mono/);
    expect(renderEmailText(options)).toContain("Your message: Saturday?");
  });
  it("makes the time the reminder's one dominant element, with the zone apart", () => {
    const { options } = customerReminderEmail({ booking: previewBooking("confirmed"), kind: "reminder_24h", businessName: "Harbor Dental", manageUrl: "https://app.example.test/b/token" });
    const html = renderEmailHtml(options);
    expect(html).toContain(">9:15 AM<"); expect(html).toContain("Eastern Time"); expect(html).toContain("Change or cancel");
    const lapsed = renderEmailHtml(requestLapsedEmail({ booking: previewBooking("declined"), businessName: "Harbor Dental", alternatives: [], bookAgainUrl: null }).options);
    expect(lapsed).toContain("line-through"); expect(lapsed).toContain("Your time wasn&#39;t confirmed"); expect(lapsed).not.toContain("Not booked");
  });
  it("keeps the newsletter free of platform credit", () => {
    const html = renderXaMailHtml(visitorNewsletterMail({ business: "Harbor Dental", subject: "News", html: "<p>Hi</p>", text: "Hi", unsubscribeUrl: "https://app.example.test/u" }));
    expect(html).not.toContain("Strelva"); expect(html).toContain("Unsubscribe from Harbor Dental");
  });
  it("says what just happened instead of repeating the standing sentence, and cancels in place", () => {
    const html = renderToStaticMarkup(<ManageBooking state={manageState("cancelled")} actionUrl="#" />);
    expect(html).toContain("This booking is cancelled"); expect(html).toContain("Done. The time is open");
    expect(html).not.toContain("<form");
    const ready = renderToStaticMarkup(<ManageBooking state={manageState("confirmed")} actionUrl="/b/t/action" />);
    expect(ready).toContain("<details"); expect(ready).toContain('name="action" value="cancel"'); expect(primaries(ready)).toBe(1);
  });
  it("holds the business name's place while loading, and confirms with one primary", () => {
    expect(renderToStaticMarkup(<VisitorBookingLoading />)).not.toContain("Business details unavailable");
    const view = confirmState("held");
    const html = renderToStaticMarkup(<BookingConfirmation identity={view.identity} error={null} actionUrl="/a" statusUrl="/s" />);
    expect(primaries(html)).toBe(1); expect(html).toContain("Confirm my email and request this time");
    // Strelva appears once, as the quiet credit under the business's page.
    expect(html.match(/Strelva/g)).toHaveLength(1); expect(html).toContain("Runs on Strelva</footer>");
  });
  it("draws the link page and blog without gradients, uppercase or a second primary", () => {
    const links = renderToStaticMarkup(<SiteLinks siteName="Harbor Dental" links={harborLinks} />);
    expect(primaries(links)).toBe(1); expect(links).not.toMatch(/gradient|uppercase|tracking-widest/);
    expect(renderToStaticMarkup(<SiteBlogIndex siteName="Harbor Dental" posts={[]} />)).toContain("No posts yet");
  });
  it("says closures in place and gives the offer page one column with one primary", () => {
    const view = offerState("choose");
    const html = renderToStaticMarkup(<InquiryBookingOffer offer={view.offer} actionUrl="#" />);
    // One week model (platform/bookings/visitor-week): the closure is said on the day it closes.
    expect(html).toContain("Closed, Thanksgiving"); expect(primaries(html)).toBe(1);
    const gone = renderToStaticMarkup(<InquiryBookingOffer offer={null} actionUrl="#" />);
    expect(gone).toContain("These times have expired"); expect(gone).not.toContain("Business details unavailable"); expect(gone).not.toContain("suggestion");
  });
  it("keeps one filled action on a native page: the header CTA goes quiet beside a hero CTA, list rows use text links", () => {
    const html = text(sitePageTree(harborSite, "/", { preview: true }));
    expect(html).toContain('class="site-action-quiet" href="/book"');
    expect((html.match(/class="site-action"/g) ?? []).length).toBe(1);
    expect(html).toContain('class="site-text-action"'); expect(html).not.toContain("site-centered");
    expect(SITE_CATALOG_CSS).not.toMatch(/font-family:var\(--font-body/); expect(SITE_CATALOG_CSS).toContain("--font-workspace");
  });
  it("never reads the app's Geist token on visitor pages", () => {
    for (const file of ["src/experience/bookings/visitor.module.css", "src/components/public/site-pages.module.css"]) expect(readFileSync(file, "utf8")).not.toMatch(/font-family:[^;]*--font-body/);
  });
  it("sends the owner's chase to the decision, not the Bookings list", () => {
    const html = renderEmailHtml(ownerRequestReminderEmail({ booking: previewBooking("requested"), businessName: "Harbor Dental", openUrl: "https://app.example.test/workspace?workspaceId=w" }).options);
    expect(html).toContain("Confirm or say not yet"); expect(html).not.toContain("Open Bookings"); expect(html).not.toContain("say not yet there");
    expect(html).toContain("border-radius:16px"); expect(html).not.toContain("border-radius:24px");
  });
});
