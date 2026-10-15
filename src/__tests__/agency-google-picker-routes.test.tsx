import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ actor: vi.fn(), admit: vi.fn(), finish: vi.fn(), begin: vi.fn(), choices: vi.fn(), target: vi.fn(), native: vi.fn(), cookies: vi.fn(), release: true }));
vi.mock("@/platform/workspaces/http", async () => ({ ...await vi.importActual("@/platform/workspaces/http"), workspaceHttpActor: f.actor }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => f.release }));
vi.mock("next/headers", () => ({ cookies: f.cookies }));
vi.mock("@/products/google-listing/server", () => ({ finishGoogleDiscovery: f.finish, beginGoogleDiscovery: f.begin, admitAgencyGoogleConnect: f.admit, readDiscoveryChoices: f.choices, chosenTarget: f.target, beginNativeGoogleOAuth: f.native, GOOGLE_DISCOVER_COOKIE: "discovery", AGENCY_GOOGLE_CHOICES_COOKIE: "agency_choices", AGENCY_DISCOVER_CALLBACK: "/api/oauth/google/agency/callback", NATIVE_GOOGLE_OAUTH_COOKIE: "native_nonce" }));
import { GET as callback } from "@/app/api/oauth/google/agency/callback/route";
import { GET as begin, POST as choose } from "@/app/api/oauth/google/agency/route";
import Page from "@/app/workspace/google/agency/page";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const workspaceId = "11111111-1111-4111-8111-111111111111", actor = { userId: "22222222-2222-4222-8222-222222222222", verifiedEmail: "agency@example.test" };
const choices = { workspaceId, googleEmail: "agency@example.test", listings: [{ accountId: "accounts/north", locationId: "harbor", title: "Harbor Dental" }], more: false };
const request = (accept = "text/html") => new Request("https://app.example.test/api/oauth/google/agency/callback?state=signed&code=code", { headers: { accept } });
const post = () => new Request("https://app.example.test/api/oauth/google/agency", { method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/json" }, body: JSON.stringify({ workspaceId, accountId: "accounts/north", locationId: "harbor" }) });
beforeEach(() => {
  vi.clearAllMocks(); f.release = true; f.actor.mockResolvedValue(actor); f.admit.mockResolvedValue("agency-id"); f.cookies.mockResolvedValue({ get: () => ({ value: "signed-cookie" }) });
  f.choices.mockReturnValue(choices); f.finish.mockResolvedValue({ status: "chosen", choices, cookie: "signed-choices" }); f.begin.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth", nonce: "nonce" }); f.target.mockReturnValue({ workspaceId, accountId: "accounts/north", locationId: "harbor" }); f.native.mockResolvedValue({ url: "https://accounts.google.com/o/oauth2/v2/auth", nonce: "native" });
});
afterEach(() => vi.unstubAllEnvs());
describe("agency picker transport", () => {
  it("redirects a browser to a real picker and sets a separate signed HttpOnly cookie", async () => {
    const response = await callback(request());
    expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(`https://app.example.test/workspace/google/agency?workspaceId=${workspaceId}`);
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.cookies.get("agency_choices")).toMatchObject({ value: "signed-choices", path: "/", maxAge: 600, secure: true, httpOnly: true, sameSite: "lax" });
    expect(await response.text()).not.toContain("agency@example.test");
    expect(f.finish).toHaveBeenCalledWith(actor, "signed", "signed-cookie", "code", "https://app.example.test", expect.objectContaining({ callbackPath: "/api/oauth/google/agency/callback" }));
  });
  it("retains JSON for scripted callers and reports a validated no-listing result on the picker", async () => {
    expect(await (await callback(request("application/json"))).json()).toMatchObject({ status: "chosen", choices });
    f.finish.mockResolvedValue({ status: "no_listings", workspaceId, googleEmail: "agency@example.test" });
    const response = await callback(request()); expect(response.headers.get("location")).toContain(`workspaceId=${workspaceId}&result=no_listings`);
    expect(response.headers.get("set-cookie")).not.toContain("signed-choices");
  });
  it("never trusts a failed callback's workspace and clears old choices", async () => {
    f.finish.mockRejectedValue(new WorkspaceAccessError("Expired"));
    const response = await callback(request()); expect(response.headers.get("location")).toBe("https://app.example.test/workspace/google/agency?result=expired");
    expect(response.headers.get("set-cookie")).toContain("agency_choices=; Path=/; Max-Age=0");
  });
  it("shows browser start failures through the guarded picker", async () => {
    f.begin.mockRejectedValue(new WorkspaceAccessError("Revoked"));
    const response = await begin(new Request(`https://app.example.test/api/oauth/google/agency?workspaceId=${workspaceId}`, { headers: { accept: "text/html" } }));
    expect(response.status).toBe(303); expect(response.headers.get("location")).toContain("result=forbidden");
  });
  it("requires current authority and signed choices before beginning pinned native consent", async () => {
    f.choices.mockReturnValue(null);
    let response = await choose(post()); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "discovery_expired" }); expect(f.native).not.toHaveBeenCalled();
    f.choices.mockReturnValue(choices); f.admit.mockRejectedValue(new WorkspaceAccessError("Revoked"));
    response = await choose(post()); expect(response.status).toBe(403); expect(f.native).not.toHaveBeenCalled();
    f.admit.mockResolvedValue("agency-id"); response = await choose(post()); expect(response.status).toBe(200);
    expect(f.native).toHaveBeenCalledWith(actor, expect.objectContaining({ workspaceId, accountId: "accounts/north", locationId: "harbor", agencyWorkspaceId: "agency-id" }), "https://app.example.test");
    expect(response.headers.get("set-cookie")).toContain("native_nonce=native");
  });
  it("does not expose choices when ordinary agency authority is gone", async () => {
    f.admit.mockRejectedValue(new WorkspaceAccessError("Revoked"));
    const page = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ workspaceId }) }));
    expect(page).toContain("no longer has access"); expect(page).not.toContain("Harbor Dental"); expect(f.choices).not.toHaveBeenCalled();
  });
  it("renders signed listings only after admission and exposes expired selection recovery", async () => {
    const page = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ workspaceId }) }));
    expect(page).toContain("Harbor Dental"); expect(f.choices).toHaveBeenCalledWith(actor, workspaceId, "signed-cookie");
    f.choices.mockReturnValue(null);
    expect(renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ workspaceId }) }))).toContain("selection expired");
  });
});
