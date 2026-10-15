import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubAllProviderKeys } from "./helpers/provider-keys";
import type { ConnectionProvider, ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";

const f = vi.hoisted(() => ({ rows: new Map<string, WorkspaceConnection[]>(), failed: new Set<string>(), reads: vi.fn() }));
function source(provider: ConnectionProvider): ConnectionSource {
  return { provider, list: async () => {
    f.reads(provider);
    if (f.failed.has(provider)) throw new Error("Fictional source outage");
    return f.rows.get(provider) ?? [];
  } };
}
vi.mock("@/products/google-listing/server", () => ({ googleBusinessProfileConnectionSource: () => source("google_business_profile") }));
vi.mock("@/products/scheduling/server", () => ({ googleCalendarConnectionSource: () => source("google_calendar"), outlookCalendarConnectionSource: () => source("outlook_calendar") }));
vi.mock("@/app/api/oauth/calendly/connection-source", () => ({ calendlyConnectionSource: source("calendly") }));
vi.mock("@/products/agency-clients/server", () => ({ ghlConnectionSource: source("highlevel") }));
vi.mock("@/products/connected-sites/server", () => ({ connectedSiteConnectionSource: source("connected_site") }));
vi.mock("@/platform/connect/connection-source", () => ({ stripeConnectionSource: source("stripe") }));
vi.mock("@/platform/infra/email/connection-source", () => ({ emailConnectionSource: source("resend") }));
vi.mock("@/app/api/oauth/instagram/connection-source", () => ({ instagramConnectionSource: source("instagram") }));

import { CONNECTION_PROVIDERS } from "@/platform/connections/contracts";
import { registerProductConnectionSources } from "@/server/connections/sources";
import { listConnectionSources } from "@/platform/connections/sources";
import { connectionEligibilityFor, listWorkspaceConnections } from "@/platform/connections/server";
import { setConnectionsDb } from "@/platform/connections/db";
import { assertGoogleConnectionEligible } from "@/platform/account-bindings/google-policy";
import { assertRequiredConnections } from "@/platform/system-versions/required-connections";
import { accountHolderLabel } from "@/experience/connections/model";

const business = "cd000000-0000-4000-8000-000000000001";
const agency = "cd000000-0000-4000-8000-000000000002";
const sibling = "cd000000-0000-4000-8000-000000000003";
const actor = { userId: "cd000000-0000-4000-8000-000000000004", verifiedEmail: "staff@north.example.test" };
let acting: string | null, area: boolean, recorded: boolean;
function fixtureRow(provider: ConnectionProvider): WorkspaceConnection {
  return { ref: `${provider}:fixture`, provider, workspaceId: business, accountLabel: `${provider} account`,
    accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] };
}
beforeEach(() => {
  stubAllProviderKeys();
  vi.clearAllMocks(); f.rows.clear(); f.failed.clear(); acting = agency; area = true; recorded = true;
  registerProductConnectionSources();
  vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", `agency:${agency}`);
  vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
  for (const provider of CONNECTION_PROVIDERS) f.rows.set(provider, [fixtureRow(provider)]);
  setConnectionsDb({ rpc: async name => ({ error: null, data: name === "read_connection_actor_scope"
    ? { actingAgencyWorkspaceId: acting, actingAgencyWorkspaceIds: acting ? [acting] : [] }
    : name === "connection_agency_holds_area" ? area
      : recorded ? [...f.rows.values()].flat().map(row => ({ ref: row.ref,
        accountHolder: row.provider === "resend" ? { kind: "platform" } : row.provider === "google_business_profile" || row.provider === "highlevel" ? { kind: "agency", workspaceId: agency } : { kind: "business", workspaceId: business },
        accessThrough: row.provider === "google_business_profile" ? { kind: "agency", workspaceId: agency } : { kind: "platform" },
      })) : [] }) });
});
afterEach(() => { setConnectionsDb(null); vi.unstubAllEnvs(); });

describe("registered Connections composed with real admission and live gate", () => {
  it("registers exactly the nine product sources idempotently without reading accounts", () => {
    registerProductConnectionSources();
    expect(listConnectionSources().map(item => item.provider)).toEqual([...CONNECTION_PROVIDERS]);
    expect(f.reads).not.toHaveBeenCalled();
  });
  it("composes every source, records whose account, and isolates a failed source", async () => {
    const result = await listWorkspaceConnections(actor, business);
    expect(result.sourceErrors).toEqual([]);
    expect(result.connections).toHaveLength(9);
    expect(new Set(f.reads.mock.calls.map(call => call[0]))).toEqual(new Set(CONNECTION_PROVIDERS));
    const google = result.connections.find(row => row.provider === "google_business_profile")!;
    expect(google).toMatchObject({ state: "connected", accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "agency", workspaceId: agency } });
    expect(accountHolderLabel(google.accountHolder, business, "customer", new Map([[agency, "North Studio"]]))).toBe("North Studio (your agency)");
    f.failed.add("calendly");
    const partial = await listWorkspaceConnections(actor, business);
    expect(partial.sourceErrors).toEqual(["calendly"]);
    expect(partial.connections).toHaveLength(8);
    recorded = false;
    expect((await listWorkspaceConnections(actor, business)).connections.every(row => row.accountHolder.kind === "unknown" && row.state === "stale")).toBe(true);
  });
  it.each([
    { scope: agency, granted: true, configured: `agency:${agency}`, allowed: true, reason: null },
    { scope: sibling, granted: true, configured: `agency:${agency}`, allowed: false, reason: "coming_soon" },
    { scope: null, granted: true, configured: `agency:${agency}`, allowed: false, reason: "coming_soon" },
    { scope: agency, granted: false, configured: `agency:${agency}`, allowed: false, reason: "area_not_granted" },
    { scope: agency, granted: true, configured: "", allowed: false, reason: "not_configured" },
    { scope: sibling, granted: true, configured: "", allowed: false, reason: "not_configured" },
    { scope: null, granted: true, configured: "", allowed: false, reason: "not_configured" },
    { scope: agency, granted: true, configured: "platform", allowed: true, reason: null },
    { scope: null, granted: true, configured: "platform", allowed: true, reason: null },
  ])("gates Google before a provider call: $scope / $granted / $configured", async ({ scope, granted, configured, allowed, reason }) => {
    acting = scope; area = granted;
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", configured);
    const providerCall = vi.fn();
    const operation = async () => { await assertGoogleConnectionEligible(actor, business); providerCall(); };
    const eligibility = await connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId: business });
    if (allowed) {
      expect(eligibility.eligible).toBe(true);
      await operation(); expect(providerCall).toHaveBeenCalledOnce();
    } else {
      expect(eligibility).toMatchObject({ eligible: false, reason });
      await expect(operation()).rejects.toThrow(reason === "area_not_granted" ? /area/ : /coming soon/);
      expect(providerCall).not.toHaveBeenCalled();
    }
  });
  it("holds a Google live requirement until both the recorded connection and current authority pass", async () => {
    const input = { actor, workspaceId: business, requiredConnections: [{ provider: "google_business_profile" as const, access: "act" as const, optional: false, purpose: "Apply approved Google changes" }] };
    f.rows.set("google_business_profile", []);
    await expect(assertRequiredConnections(input)).rejects.toThrow(/connect or reconnect/);
    f.rows.set("google_business_profile", [fixtureRow("google_business_profile")]);
    await expect(assertRequiredConnections(input)).resolves.toBeUndefined();
    acting = sibling;
    await expect(assertRequiredConnections(input)).rejects.toThrow(/coming soon/);
    acting = agency; area = false;
    await expect(assertRequiredConnections(input)).rejects.toThrow(/area/);
    area = true; recorded = false;
    await expect(assertRequiredConnections(input)).rejects.toThrow(/connect or reconnect/);
    recorded = true; f.failed.add("google_business_profile");
    await expect(assertRequiredConnections(input)).rejects.toThrow(/retry checking/);
  });
  it("reports provider eligibility even before the first account exists", async () => {
    f.rows.set("google_business_profile", []); acting = null;
    expect((await listWorkspaceConnections(actor, business)).providerEligibility.google_business_profile).toMatchObject({ eligible: false, reason: "coming_soon" });
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", "platform");
    expect((await listWorkspaceConnections(actor, business)).providerEligibility.google_business_profile).toMatchObject({ eligible: true, through: { kind: "platform" } });
  });
});
