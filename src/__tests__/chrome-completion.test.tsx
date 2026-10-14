// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrelvaSidebar } from "@/experience/app-frame/StrelvaSidebar";
import { StrelvaDemo } from "@/experience/app-frame/StrelvaDemo";
import DemoPage from "@/app/preview/strelva/demo/page";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import BusinessPayment from "@/app/pay/business/BusinessPayment";
import { businessDepositFixture } from "@/experience/workspace/preview/deposit-fixture";
import { OwnerMoneyPreview } from "@/experience/workspace/preview/OwnerMoneyPreview";
import { VersionsComparisonPreview } from "@/experience/workspace/preview/SystemsDetailsPreview";
import { OwnerInvitationsPanel } from "@/app/admin/clients/[id]/OwnerInvitationsPanel";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const click = async (text: string) => {
  const button = [...host.querySelectorAll<HTMLElement>("button, a")].find(el => el.textContent === text)!;
  expect(button, text).toBeDefined();
  await act(async () => button.click());
};

describe("chrome completion", () => {
  it.each([
    { active: "settings" as const, pinned: [{ id: "payments", title: "Payments", href: "/payments", current: true }] },
    { active: "settings" as const, agencyNavigation: { active: "clients" as const, paymentLinksCurrent: true } },
    { active: "settings" as const, agencyNavigation: { active: "clients" as const, leadsAvailable: true, leadsCurrent: true } },
    { agencyNavigation: { active: "home" as const } },
    { agencyNavigation: { active: "verification" as const } },
    { active: "account" as const, pinned: [] },
    { active: "settings" as const, pinned: [{ id: "payments", title: "Payments", href: "/payments", current: true }], agencyNavigation: { active: "clients" as const, paymentLinksCurrent: true } },
  ])("selects one place for a leaf or agency page: %j", async props => {
    await act(async () => root.render(<StrelvaSidebar {...props} workspaceId="business" workspaceName="Harbor Dental" accountName="Jo" signOut={null} />));
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
  it("uses North Studio where the fixture says North Studio did the work", () => {
    for (const element of [<OwnerMoneyPreview key="billing" surface="billing" />, <VersionsComparisonPreview key="versions" state="ready" mode="light" />]) {
      const html = renderToStaticMarkup(element);
      expect(html).toContain("North Studio · Runs on Strelva");
      expect(html).not.toContain("Strelva Agency");
      expect(html).not.toContain('aria-label="Strelva platform"');
    }
  });
  it("keeps current serving identity separate from an earlier agency's work", () => {
    const brand = { agencyId: "current-agency", name: "Current Studio", logoUrl: null, accentColor: "#447a4f", replyTo: null, credit: "runs_on_strelva" as const };
    const html = renderToStaticMarkup(<StrelvaShell workspaceName="Harbor Dental" ownerBrand={brand} signOut={null}><p>Built by Original Studio</p></StrelvaShell>);
    expect(html).toContain("Current Studio · Runs on Strelva");
    expect(html).toContain("Built by Original Studio");
  });
  it("names owner access separately from the owner's identity", () => {
    const html = renderToStaticMarkup(<OwnerInvitationsPanel tenantId="fixture" load={{ kind: "unconverted" }} />);
    expect(html).toContain("Owner access"); expect(html).not.toMatch(/>Owner</);
  });
  it("supplies the visitor fixture identity while keeping missing real identity fail closed", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<BusinessPayment token="fixture" initialRequest={businessDepositFixture} preview />));
    expect(host.textContent).toContain("Your booking deposit with Lakeview Yoga");
    expect(host.textContent).toContain("Fictional payment preview");
    expect(host.textContent).not.toContain("Business details unavailable");
    expect(host.textContent).not.toContain("Accept and pay");
    await act(async () => root.render(<BusinessPayment key="missing" token="fixture" initialRequest={{ ...businessDepositFixture, businessName: undefined }} />));
    expect(host.textContent).toContain("business identity is unavailable");
    expect(host.textContent).not.toContain("Accept and pay");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not read a real token when a preview fixture is absent", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<BusinessPayment token="fixture" preview />));
    expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("Accept and pay");
  });
  it("serves only the bounded demo in production while other previews remain gated", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("STRELVA_UI_PREVIEW", "0"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(strelvaUiPreviewEnabled()).toBe(false);
    const html = renderToStaticMarkup(DemoPage());
    expect(html).toContain("Fictional 1.0 demo"); expect(html).toContain('href="/audit"');
    expect(html).not.toContain("/client/demo/dashboard");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    expect(renderToStaticMarkup(DemoPage())).toContain('href="/audit"');
    vi.stubEnv("STRELVA_BUSINESS_SIGNUP_RELEASE", "1");
    expect(renderToStaticMarkup(DemoPage())).toContain('href="/sign-up?as=business"');
  });
  it("compares, accepts and undoes a fictional change without any network request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<StrelvaDemo startHref="/audit" />));
    await click("Review Possibility");
    await click("Before"); expect(host.textContent).toContain("Call Harbor Dental");
    await click("After"); expect(host.textContent).toContain("Request an appointment with Harbor Dental");
    const hold = [...host.querySelectorAll("button")].find(el => el.textContent?.includes("Hold to make it live"))!;
    await act(async () => { hold.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await act(async () => vi.advanceTimersByTime(2000));
    expect(host.textContent).toContain("Accepted in this demo");
    await click("Appointments"); expect(host.textContent).toContain("Release 2");
    await click("Undo in demo"); expect(host.textContent).toContain("Release 1");
    expect(host.querySelector("[data-frame-composer] textarea, [data-frame-composer] input")).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
