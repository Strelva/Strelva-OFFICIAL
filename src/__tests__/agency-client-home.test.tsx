import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readAgencyClientHome } from "@/experience/workspace/agency-client-home-server";
import { AgencyClientDecisionStatus, AgencyClientDeliveryCheck } from "@/experience/workspace/AgencyClientHomeSections";
import { servingAgencyNames } from "@/platform/service-requests/agency-names";
import { deliveryProviderName } from "@/experience/workspace/WorkspaceRequests";
import { businessDeliveryItems, requestStageLabel } from "@/experience/workspace/business-delivery-summary";
import { workspaceReadEligibility } from "@/experience/workspace/workspace-read-eligibility";
import { clientDecisionHref, readWorkspaceLocation, workspaceReturnTarget } from "@/platform/workspaces/location";
import type { AgencyClientHome } from "@/experience/workspace/agency-client-home";
import type { ServiceRequest } from "@/platform/service-requests/types";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
const workspaceId = "b9200000-0000-4000-8000-000000000001", id = "b9200000-0000-4000-8000-000000000002";
const agencyId = "b9200000-0000-4000-8000-000000000003", actor = { userId: agencyId, verifiedEmail: "staff@example.test" };
const at = "2026-10-11T12:00:00Z";
const projection: AgencyClientHome = { workspaceId, decisions: [{ id, title: "Make the intake live", systemId: null, since: at, state: "open" }], deliveries: [], changes: [], deliveryChecks: [] };
function request(): ServiceRequest { return { id, businessId: workspaceId, status: "requested", request: "Please prepare intake", outcome: "Intake flow", context: {}, scope: ["help_request"], provider: { kind: "agency", agencyWorkspaceId: agencyId }, providerAcceptance: { status: "pending", actorId: null, acceptedAt: null, note: null }, installationId: null, deliveryId: null, revision: 1, createdBy: workspaceId, createdAt: at, updatedAt: at, deliveryCommitment: null }; }
describe("agency client shared read", () => {
  it("shares read eligibility between routing and navigation without owner commands", () => {
    expect(workspaceReadEligibility({ id: workspaceId, name: "Harbor Dental", kind: "customer", access: "provider_seat", role: "admin" }, true)).toMatchObject({ agency: true, decisions: true, deliveries: true, canDecide: false });
    expect(workspaceReadEligibility({ id: workspaceId, name: "Harbor Dental", kind: "customer", access: "delegated_read" }, true)).toMatchObject({ decisions: false, deliveries: false, canDecide: false });
    expect(workspaceReadEligibility({ id: workspaceId, name: "Harbor Dental", kind: "customer", access: "provider_seat" }, false).decisions).toBe(false);
  });
  it("passes current actor to the database and rejects wrong-scope or malformed projections", async () => {
    const rpc = vi.fn(async () => ({ data: projection, error: null }));
    expect(await readAgencyClientHome(actor, workspaceId, { rpc })).toEqual(projection);
    expect(rpc).toHaveBeenCalledWith("read_agency_client_home", { p_workspace_id: workspaceId, p_user_id: agencyId, p_verified_email: actor.verifiedEmail });
    await expect(readAgencyClientHome(actor, agencyId, { rpc })).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(readAgencyClientHome(actor, workspaceId, { rpc: async () => ({ data: { ...projection, decisionHash: "private" }, error: null }) })).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(readAgencyClientHome(actor, workspaceId, { rpc: async () => ({ data: null, error: { message: "business_record_access_denied" } }) })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("opens the same exact decision with a read-only named waiting state", () => {
    const href = clientDecisionHref(workspaceId, id);
    expect(readWorkspaceLocation(new URL(href, "https://example.test").searchParams)).toMatchObject({ view: "needs-you", workspaceId, decision: id });
    expect(workspaceReturnTarget(href)).toBe(href);
    expect(readWorkspaceLocation(new URLSearchParams({ workspaceId, view: "requests", decision: id })).decision).toBeUndefined();
    const html = renderToStaticMarkup(createElement(AgencyClientDecisionStatus, { state: { status: "ready", data: projection }, businessName: "Harbor Dental", workspaceId, selectedId: id, onRetry: vi.fn() }));
    expect(html).toContain("Waiting on Harbor Dental"); expect(html).toContain("Make the intake live");
    expect(html).toContain(`id="decision-${id}"`); expect(html).not.toContain("<button");
    expect(html).not.toContain("Hold to approve");
  });
  it("lists what the business decided under Recently decided, newest first, and only on the default view", () => {
    const [open] = projection.decisions;
    const approved = { id: "b9200000-0000-4000-8000-0000000000b1", title: "Approved intake", systemId: null, since: "2026-10-12T12:00:00Z", state: "approved" as const };
    const declined = { id: "b9200000-0000-4000-8000-0000000000b2", title: "Declined banner", systemId: null, since: "2026-10-13T12:00:00Z", state: "declined" as const };
    const data = { ...projection, decisions: [open!, approved, declined] };
    const render = (selectedId?: string) => renderToStaticMarkup(createElement(AgencyClientDecisionStatus, { state: { status: "ready", data }, businessName: "Harbor Dental", workspaceId, selectedId, onRetry: vi.fn() }));
    const html = render();
    expect(html).toContain("Make the intake live");
    expect(html).toContain("Recently decided");
    expect(html).toContain("Approved by the business");
    expect(html).toContain("Not yet");
    expect(html.indexOf("Declined banner")).toBeLessThan(html.indexOf("Approved intake"));
    expect(html).not.toContain("<button");
    const selected = render(approved.id);
    expect(selected).not.toContain("Recently decided");
    expect(selected).toContain("Approved intake");
    expect(selected).not.toContain("Declined banner");
    expect(renderToStaticMarkup(createElement(AgencyClientDecisionStatus, { state: { status: "ready", data: projection }, businessName: "Harbor Dental", workspaceId, onRetry: vi.fn() }))).not.toContain("Recently decided");
  });
  it.each(["loading", "error"] as const)("shows %s instead of a false all-clear", status => {
    const html = renderToStaticMarkup(createElement(AgencyClientDecisionStatus, { state: { status }, businessName: "Harbor Dental", workspaceId, onRetry: vi.fn() }));
    expect(html).toContain(status === "error" ? "could not be checked" : "Checking shared decision status");
    expect(html).not.toContain("No shared decisions are waiting");
  });
  it("shows resolved or unavailable item links honestly", () => {
    const html = renderToStaticMarkup(createElement(AgencyClientDeliveryCheck, { state: { status: "ready", data: projection }, selectedKey: `website:${id}`, workspaceId, onRetry: vi.fn() }));
    expect(html).toContain("resolved or no longer available");
  });
  it("carries a connected-site delivery check: its key parses and its title renders", async () => {
    const siteKey = `site:${id}`;
    const withCheck: AgencyClientHome = { ...projection, deliveryChecks: [{ key: siteKey, title: "Website change on bakery.example", systemId: null, status: "not_confirmed", at }] };
    const rpc = vi.fn(async () => ({ data: withCheck, error: null }));
    expect(await readAgencyClientHome(actor, workspaceId, { rpc })).toEqual(withCheck);
    const html = renderToStaticMarkup(createElement(AgencyClientDeliveryCheck, { state: { status: "ready", data: withCheck }, selectedKey: siteKey, workspaceId, onRetry: vi.fn() }));
    expect(html).toContain("Website change on bakery.example");
    expect(html).toContain("Read-back not confirmed");
  });
  it("uses serving-agency identity even when the viewer has no agency membership", async () => {
    const rows = [request()];
    const rpc = vi.fn(async () => ({ data: [{ requestId: id, displayName: "North Studio" }], error: null }));
    const names = await servingAgencyNames(actor, rows, { rpc });
    const item = businessDeliveryItems(rows, new Map(names.map(row => [row.requestId, row.displayName])))[0]!;
    expect(deliveryProviderName(item, new Map())).toBe("North Studio");
    expect(deliveryProviderName({ ...item, servingAgencyName: null }, new Map([[agencyId, "Viewer’s other agency"]]))).toBe(""); // XA: never the viewer's other agency, never a stand-in; the row leaves the name out
    expect(deliveryProviderName({ ...item, provider: { kind: "strelva" } }, new Map())).toBe("Strelva Agency");
    expect(requestStageLabel("asked", { agencySeat: true, businessName: "Harbor Dental", agencyName: "North Studio" })).toBe("Ready for North Studio's review");
    expect(requestStageLabel("ready_for_review", { agencySeat: true, businessName: "Harbor Dental" })).toBe("Waiting on Harbor Dental");
  });
  it("keeps agency lookup errors, malformed and unrequested rows unavailable", async () => {
    for (const result of [{ data: null, error: "offline" }, { data: [{ requestId: agencyId, displayName: "Wrong scope" }], error: null }, { data: [{ requestId: id, displayName: "" }], error: null }]) {
      expect(await servingAgencyNames(actor, [request()], { rpc: async () => result })).toEqual([{ requestId: id, displayName: null }]);
    }
    expect(await servingAgencyNames(actor, [request()], { rpc: async () => { throw new Error("offline"); } })).toEqual([{ requestId: id, displayName: null }]);
  });
});
