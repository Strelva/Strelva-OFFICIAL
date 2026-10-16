import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderEmailHtml, renderEmailText } from "@/lib/email/layout";
import { renderPaperEmailHtml, offeredDatesPaperEmail, type PaperEmail } from "@/lib/email/paper";
import { EMAIL_PREVIEW_TEMPLATES } from "@/experience/workspace/preview/email-fixture";
import { GET } from "@/app/preview/strelva/email/html/route";

const example = EMAIL_PREVIEW_TEMPLATES.urgent.email;
describe("paper email presentation", () => {
  it.each(Object.entries(EMAIL_PREVIEW_TEMPLATES))("renders %s through the existing layout in HTML and plain text", (_key, specimen) => {
    const opts = { heading: specimen.email.subject, paper: specimen.email };
    expect(renderEmailHtml(opts)).toContain('table role="presentation"');
    expect(renderEmailHtml(opts)).not.toMatch(/<script|<form|<style|display:flex|display:grid|var\(--/);
    expect(renderEmailText(opts)).toContain(specimen.email.subject);
    expect(renderEmailText(opts)).toContain(specimen.email.footer);
  });
  it("escapes content and every action label and URL", () => {
    const paper: PaperEmail = { ...example, subject: '<img src=x onerror="bad">', blocks: [{ kind: "actions", actions: [{ label: '<script>bad</script>', url: 'https://example.com/?a=1&b="bad"' }] }] };
    const html = renderPaperEmailHtml(paper);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a=1&amp;b=&quot;bad&quot;');
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "//other.example", "https://example.com/\n", "\\\\other.example"])("refuses unsafe links %s", url => {
    expect(() => renderPaperEmailHtml({ ...example, blocks: [{ kind: "actions", actions: [{ label: "Open", url }] }] })).toThrow();
  });
  it("keeps payment schedules and unavailable export coverage explicit", () => {
    expect(renderEmailText({ heading: "", paper: EMAIL_PREVIEW_TEMPLATES.declined.email })).not.toContain("we try the card again");
    const archive = renderEmailText({ heading: "", paper: EMAIL_PREVIEW_TEMPLATES.export.email });
    expect(archive).toContain(".json");
    expect(archive).toContain("Unavailable");
    expect(archive).not.toContain(".zip");
  });
  it("requires one to three offered dates and promises no reservation on open", () => {
    const input = { sender: "[business]", senderDetail: "", subject: "Dates", greeting: "Open to review", footer: "Not held", dates: [] };
    expect(() => offeredDatesPaperEmail(input)).toThrow();
    expect(() => offeredDatesPaperEmail({ ...input, dates: Array.from({ length: 4 }, () => ({ label: "Date", reviewUrl: "https://example.com/review" })) })).toThrow();
    expect(renderEmailText({ heading: "", paper: EMAIL_PREVIEW_TEMPLATES.dates.email })).toContain("Opening a link does nothing");
  });
  it("matches the email literal palette to the canonical light token boundary", () => {
    const source = readFileSync("src/app/styles/workspace-paper.css", "utf8");
    expect(source).toContain("--st-accent: #2f5236");
    expect(readFileSync("src/app/styles/workspace-xa.css", "utf8")).toContain("--st-action: #161715");
    const html = renderPaperEmailHtml({ ...example, blocks: [{ kind: "actions", actions: [{ label: "Open", url: "https://example.com/open", style: "primary" }] }] });
    // The one primary is ink, like the product's one ink pill; moss stays for live and confirmation.
    expect(html).toContain("background:#161715"); expect(html).not.toContain("background:#2f5236");
    expect(renderPaperEmailHtml(example)).toContain("family=DM+Sans");
  });
  it("uses DM Sans only and lets the paper fit its content", () => {
    const source = readFileSync("src/platform/infra/email/paper-tokens.ts", "utf8") + readFileSync("src/platform/infra/email/paper.ts", "utf8");
    expect(source).not.toMatch(/mono|Geist/i);
    expect(renderPaperEmailHtml(example)).not.toContain("height:760px");
  });
});
describe("raw preview route", () => {
  it("fails closed when the preview gate is off", async () => {
    vi.stubEnv("STRELVA_UI_PREVIEW", "0");
    expect((await GET(new Request("http://localhost/preview/strelva/email/html"))).status).toBe(404);
    vi.unstubAllEnvs();
  });
  it("serves no-store fixture HTML only in the preview gate and refuses unknown templates", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("STRELVA_UI_PREVIEW", "1");
    const response = await GET(new Request("http://localhost/preview/strelva/email/html?template=urgent"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'none'");
    expect((await GET(new Request("http://localhost/preview/strelva/email/html?template=__proto__"))).status).toBe(404);
    vi.unstubAllEnvs();
  });
});
