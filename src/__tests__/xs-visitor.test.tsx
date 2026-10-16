import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { VisitorBookingLoading } from "@/experience/bookings/VisitorBookingLoading";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";
import { SiteLinks } from "@/components/public/SiteLinks";
import { SiteBlogIndex } from "@/components/public/SiteBlog";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { visitorNewsletterMail, offeredDatesMail } from "@/platform/infra/email/visitor-mail";
import { renderXaMailHtml } from "@/platform/infra/email/xa-mail";
import { customerReminderEmail, requestLapsedEmail } from "@/platform/bookings/emails";
import { confirmState, harborLinks, manageState, previewBooking } from "@/experience/workspace/preview/xs-visitor-fixture";

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
    expect(lapsed).toContain("line-through"); expect(lapsed).toContain("Not booked");
  });
  it("keeps the newsletter free of platform credit and offers dates as links that only open a page", () => {
    const html = renderXaMailHtml(visitorNewsletterMail({ business: "Harbor Dental", subject: "News", html: "<p>Hi</p>", text: "Hi", unsubscribeUrl: "https://app.example.test/u" }));
    expect(html).not.toContain("Strelva"); expect(html).toContain("Unsubscribe from Harbor Dental");
    expect(() => offeredDatesMail({ business: "B", person: "P", greeting: "G", dates: [] })).toThrow();
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
    expect(primaries(html)).toBe(1); expect(html).toContain("Confirm my email and request this time"); expect(html).not.toContain("Strelva");
  });
  it("draws the link page and blog without gradients, uppercase or a second primary", () => {
    const links = renderToStaticMarkup(<SiteLinks siteName="Harbor Dental" links={harborLinks} />);
    expect(primaries(links)).toBe(1); expect(links).not.toMatch(/gradient|uppercase|tracking-widest/);
    expect(renderToStaticMarkup(<SiteBlogIndex siteName="Harbor Dental" posts={[]} />)).toContain("No posts yet");
  });
});
