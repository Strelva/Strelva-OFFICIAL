// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuiltInApp } from "@/platform/app-releases/contracts";

const TEST_APPS: BuiltInApp[] = [{
  id: "bookings", name: "Bookings", publisher: "platform", systemKinds: ["booking"], labelOnSystems: true, makeRealChannels: [], availability: [],
  releases: [
    { key: "bookings.baseline", number: 1, summary: "Base.", shippedIn: "1.0.0", changesLiveBehavior: false, gates: [], requiredConnections: [] },
    { key: "bookings.reports", number: 2, summary: "Reports.", shippedIn: null, changesLiveBehavior: true, gates: [{ kind: "workspace_flag", flag: "catalog_reports" }], requiredConnections: [] },
  ],
}];

// The component sees the test catalog; the real helper does the formatting.
vi.mock("@/platform/app-releases/catalog", async importOriginal => {
  const actual = await importOriginal<typeof import("@/platform/app-releases/catalog")>();
  return { ...actual, flagReleaseMeaning: (flag: string) => actual.flagReleaseMeaning(flag, TEST_APPS) };
});

import { flagReleaseMeaning } from "@/platform/app-releases/catalog";
import { AgencyClientAvailability } from "@/experience/workspace/agency/AgencyClientAvailability";
import { ReleaseFlagsPanel } from "@/app/admin/clients/[id]/ReleaseFlagsPanel";
import type { TenantReleaseState } from "@/platform/owner-entry/operator";

const AGENCY = "25600000-0000-4000-8000-000000000020", WS = "25600000-0000-4000-8000-000000000010", SYSTEM = "25600000-0000-4000-8000-000000000040";
const MEANING = "On turns on Bookings Release 2. Off returns Bookings to Release 1.";

const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(async () => { for (const root of roots.splice(0)) await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("what Off rolls back to", () => {
  it("is null for a flag that gates no Release", () => {
    expect(flagReleaseMeaning("inquiries")).toBeNull();
    expect(flagReleaseMeaning("not_a_flag")).toBeNull();
  });

  it("says what On and Off do for a gated Release", () => {
    expect(flagReleaseMeaning("catalog_reports")).toBe(MEANING);
  });

  it("renders in the agency's Client feature availability", async () => {
    const view = { agencyWorkspaceId: AGENCY, workspaceId: WS, flags: [{
      flag: "catalog_reports", label: "Reports", ceiling: "on", ceilingRevision: 1, systemId: SYSTEM, systemName: "Consult booking", verificationEffect: "publish", verified: true,
      state: "off", revision: 1, changedAt: null, environment: "workspace", workspaceReleased: true,
    }] };
    const request = vi.fn<typeof fetch>(async () => Response.json(view));
    const node = document.createElement("div"); document.body.append(node);
    const root = createRoot(node); roots.push(root);
    await act(async () => root.render(createElement(AgencyClientAvailability, { agencyWorkspaceId: AGENCY, workspaceId: WS, request })));
    await act(async () => { const details = node.querySelector("details")!; details.open = true; details.dispatchEvent(new Event("toggle")); });
    expect(node.textContent).toContain(MEANING);
  });

  it("renders in the operator release panel", () => {
    const state: TenantReleaseState = {
      linked: true, tenantId: "preview-business", workspaceId: WS, workspaceRelease: true,
      flags: [{ flag: "catalog_reports", label: "Reports", envName: "STRELVA_CATALOG_REPORTS_RELEASE", envMode: "workspace", row: null, revision: 0, effective: "off" }],
      testerEmails: [], history: [], ownerEntryBlockers: [],
    } as never;
    expect(renderToStaticMarkup(createElement(ReleaseFlagsPanel, { tenantId: "preview-business", initialState: state }))).toContain(MEANING);
  });
});
