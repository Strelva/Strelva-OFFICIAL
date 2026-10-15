import { describe, expect, it } from "vitest";
import {
  CONNECTED_SITE_CHANGE_SCOPE, CONNECTED_SITE_CHANGE_SOURCE, connectedSiteChangeBrief, connectedSiteChangeRequestCommand, connectedSiteChangeStage,
  editStepsFor, pageShowsChange, planInputSchema, type ConnectedSiteChange,
} from "@/products/connected-sites/client";

type S = { kind: string; ownerFacing: boolean | null; checkResult: string | null; readBack: string | null };
const step = (kind: string, extra: Partial<S> = {}): S => ({ kind, ownerFacing: null, checkResult: null, readBack: null, ...extra });
const planned = (ownerFacing: boolean) => step("planned", { ownerFacing });

describe("connectedSiteChangeStage", () => {
  it.each<[string, S[], string]>([
    ["no steps", [], "unplanned"],
    ["owner-facing plan", [planned(true)], "planned_waiting"],
    ["plan the owner need not see", [planned(false)], "ready_to_make"],
    ["approved", [planned(true), step("approved")], "ready_to_make"],
    ["declined", [planned(true), step("declined")], "declined"],
    ["marked done", [planned(false), step("marked_done")], "checking"],
    ["checked, not visible", [planned(false), step("marked_done"), step("checked", { checkResult: "not_visible" })], "not_seen"],
    ["checked, unreachable", [planned(false), step("marked_done"), step("checked", { checkResult: "unreachable" })], "not_seen"],
    ["checked visible then released confirmed", [planned(false), step("marked_done"), step("checked", { checkResult: "visible" }), step("released", { readBack: "confirmed" })], "done"],
    ["released not confirmed", [planned(false), step("marked_done"), step("checked", { checkResult: "not_visible" }), step("released", { readBack: "not_confirmed" })], "done_unconfirmed"],
    ["withdrawn", [planned(true), step("withdrawn")], "withdrawn"],
    ["a re-plan after declined", [planned(true), step("declined"), planned(true)], "planned_waiting"],
    ["a re-plan after not seen", [planned(false), step("marked_done"), step("checked", { checkResult: "not_visible" }), planned(true)], "planned_waiting"],
  ])("%s", (_name, steps, expected) => expect(connectedSiteChangeStage(steps)).toBe(expected));
});

describe("pageShowsChange", () => {
  const page = (body: string) => `<html><head><title>Hours</title><style>.x{}</style></head><body>${body}</body></html>`;
  it("matches curly quotes and non-breaking spaces", () => {
    const html = page("<p>We&rsquo;re open&nbsp;Saturday&#160;9&ndash;2 &amp; Sunday</p>".replace("&rsquo;", "’").replace("&ndash;", "–"));
    const r = pageShowsChange(html, { expectText: "We're open Saturday 9-2 & Sunday" });
    expect(r.result).toBe("visible");
    expect(r.matched).toContain("Saturday");
  });
  it("matches across tags and entities, any case", () => {
    expect(pageShowsChange(page("<h2>Open <b>Saturday</b> &#x39;&ndash;2</h2>".replace("&ndash;", "–")), { expectText: "OPEN SATURDAY 9-2" }).result).toBe("visible");
  });
  it("never matches script, style or comment text", () => {
    const html = page('<script>var s = "Secret offer";</script><style>.a:after{content:"Secret offer"}</style><!-- Secret offer --><noscript>Secret offer</noscript><p>Hello</p>');
    expect(pageShowsChange(html, { expectText: "Secret offer" })).toMatchObject({ result: "not_visible", matched: null });
  });
  it("is not visible while the text that should be gone is still there", () => {
    const html = page("<p>Open Saturday 9-2</p><p>Closed Saturdays</p>");
    expect(pageShowsChange(html, { expectText: "Open Saturday 9-2", removeText: "Closed Saturdays" }).result).toBe("not_visible");
    expect(pageShowsChange(html, { expectText: "Open Saturday 9-2", removeText: "Open Sundays" }).result).toBe("visible");
  });
  it("keeps the matched context to 300 characters", () => {
    const html = page(`<p>${"word ".repeat(400)}needle ${"tail ".repeat(400)}</p>`);
    const r = pageShowsChange(html, { expectText: "needle" });
    expect(r.result).toBe("visible");
    expect(r.matched!.length).toBeLessThanOrEqual(300);
    expect(r.matched).toContain("needle");
  });
});

describe("editStepsFor", () => {
  it("gives four steps for Wix and names the page", () => {
    const steps = editStepsFor("wix", { pagePath: "/hours", whatToChange: "Update the Saturday hours" });
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain("/hours");
    expect(steps[1]).toBe("Make this change: Update the Saturday hours");
    expect(steps[2]).toBe("Choose Publish (top right).");
    expect(steps[3]).toBe("Come back to Strelva and choose Mark done.");
  });
  it("reads the root as the home page and falls back for unknown builders", () => {
    expect(editStepsFor("squarespace", { pagePath: "/", whatToChange: "x" })[0]).toContain("the home page");
    expect(editStepsFor("unknown", { pagePath: "/a", whatToChange: "x" })[0]).toBe("Open whatever you use to change /a on the site.");
  });
});

describe("connectedSiteChangeRequestCommand", () => {
  it("files a connected-site Request to the agency", () => {
    const cmd = connectedSiteChangeRequestCommand({
      provider: { kind: "agency", agencyWorkspaceId: "a".repeat(8) + "-0000-4000-8000-000000000000" }, workspaceId: "w", systemId: "s", connectedSiteId: "c", siteHost: "bakery.example",
      platform: "wix", words: "  Change the banner  ", page: "/".repeat(600), origin: "owner", idempotencyKey: "k1",
    });
    expect(cmd).toMatchObject({ action: "save", businessId: "w", status: "requested", request: "Change the banner", outcome: "Change the banner", scope: [CONNECTED_SITE_CHANGE_SCOPE], idempotencyKey: "k1" });
    expect(cmd.context).toMatchObject({ source: CONNECTED_SITE_CHANGE_SOURCE, systemId: "s", connectedSiteId: "c", siteHost: "bakery.example", platform: "wix", origin: "owner" });
    expect(cmd.context.page).toHaveLength(500);
  });
});

describe("connectedSiteChangeBrief", () => {
  const change: ConnectedSiteChange = {
    id: "77000000-0000-4000-8000-000000000001", requestId: null, origin: "agency", title: "Update the Saturday hours", createdAt: "2026-10-20T00:00:00Z", stage: "ready_to_make",
    steps: [{ id: "77000000-0000-4000-8000-000000000002", kind: "planned", pageUrl: "https://bakery.example/hours", editSteps: ["Open Pages.", "Make this change: x", "Choose Publish."], expectText: "Open Saturday 9-2", removeText: "Closed Saturdays", ownerFacing: true, checkResult: null, matched: null, readBack: null, releaseNumber: null, note: null, recordedAt: "2026-10-20T00:00:00Z", actor: null }],
  };
  const text = connectedSiteChangeBrief({ change, siteHost: "bakery.example", platformLabel: "Wix", taskUrl: "https://app.strelva.test/workspace?view=system&system=s&workspaceId=w" });
  it("carries the task, steps, expected text and rules", () => {
    expect(text).toContain("Task: change bakery.example in Wix");
    expect(text).toContain("1. Open Pages.");
    expect(text).toContain("“Open Saturday 9-2”");
    expect(text).toContain("no longer say: “Closed Saturdays”");
    expect(text).toContain("Strelva doesn't make the edit and can't log in to Wix.");
    expect(text).toContain("https://app.strelva.test/workspace?view=system");
  });
  it("never includes keys, tokens or emails", () => expect(text).not.toMatch(/sk_pub_|@|token/i));
});

describe("planInputSchema", () => {
  it("rejects unknown keys and a missing owner decision", () => {
    expect(planInputSchema.safeParse({ pageUrl: "https://a.example/x", whatToChange: "a", expectText: "b", ownerFacing: true }).success).toBe(true);
    expect(planInputSchema.safeParse({ pageUrl: "https://a.example/x", whatToChange: "a", expectText: "b", ownerFacing: true, extra: 1 }).success).toBe(false);
    expect(planInputSchema.safeParse({ pageUrl: "https://a.example/x", whatToChange: "a", expectText: "b" }).success).toBe(false);
  });
});
