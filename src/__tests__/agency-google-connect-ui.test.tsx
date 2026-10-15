// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgencyConnectLinkButton } from "@/experience/places/AgencyConnectLink";
import { AgencyGooglePicker } from "@/experience/places/AgencyGooglePicker";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const listing = { accountId: "accounts/north", locationId: "harbor", title: "Harbor Dental", address: "Buffalo" };
const choices = { googleEmail: "agency@north.example", listings: [listing], more: true };
let root: Root, node: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...node.querySelectorAll("button")].find(item => item.textContent === text)!;
const click = async (text: string) => act(async () => button(text).click());

describe("agency Google options", () => {
  it("offers agency consent without producing an owner message or clipboard control", async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ kind: "agency_connect", link: `${window.location.origin}/api/oauth/google/agency?workspaceId=${workspaceId}`, message: "Connect your agency's own Google account. No message is sent to the owner." }));
    await act(async () => root.render(<AgencyConnectLinkButton workspaceId={workspaceId} request={request} />));
    await click("Check Google connection options");
    expect(node.querySelector("a")?.getAttribute("href")).toBe(`/api/oauth/google/agency?workspaceId=${workspaceId}`);
    expect(node.textContent).toContain("Connect your agency’s Google account");
    expect(node.textContent).not.toContain("Copy message");
    expect(request.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ workspaceId }));
  });
  it.each(["first_connect", "reconnect"])("keeps %s as a selectable owner message and only copies after a deliberate click", async kind => {
    const writeText = vi.fn().mockRejectedValue(new Error("No clipboard"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const message = "Connect here: https://app.example.test/workspace/google. Nothing is posted.";
    await act(async () => root.render(<AgencyConnectLinkButton workspaceId={workspaceId} request={async () => Response.json({ kind, link: "https://app.example.test/workspace/google", message })} />));
    await click("Check Google connection options");
    expect(writeText).not.toHaveBeenCalled(); expect(node.textContent).not.toContain("Connect your agency’s Google account");
    await click("Copy message");
    expect(writeText).toHaveBeenCalledExactlyOnceWith(message);
    expect(node.querySelector('[aria-label="Message for the owner"]')?.textContent).toBe(message);
    expect(node.textContent).toContain("Select the message above");
  });
  it("rejects an agency link to another origin", async () => {
    await act(async () => root.render(<AgencyConnectLinkButton workspaceId={workspaceId} request={async () => Response.json({ kind: "agency_connect", link: `https://elsewhere.example/api/oauth/google/agency?workspaceId=${workspaceId}`, message: "Do not trust" })} />));
    await click("Check Google connection options");
    expect(node.querySelector("a")).toBeNull(); expect(node.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("agency Google listing picker", () => {
  it("sends only the exact listing and business, then follows a verified Google consent URL", async () => {
    const navigate = vi.fn();
    const request = vi.fn<typeof fetch>(async () => Response.json({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=signed" }));
    await act(async () => root.render(<AgencyGooglePicker workspaceId={workspaceId} choices={choices} request={request} navigate={navigate} />));
    expect(node.textContent).toContain("agency@north.example"); expect(node.textContent).toContain("Only the first 1 listings");
    await click("Connect this listing");
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/oauth/google/agency", expect.objectContaining({ method: "POST", body: JSON.stringify({ workspaceId, accountId: listing.accountId, locationId: listing.locationId }) }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("https://accounts.google.com/o/oauth2/v2/auth?state=signed");
  });
  it.each([[401, "Sign in again"], [403, "no longer has access"], [409, "selection expired"]])("closes choices on %s and offers the appropriate recovery", async (status, text) => {
    const navigate = vi.fn();
    await act(async () => root.render(<AgencyGooglePicker workspaceId={workspaceId} choices={choices} request={async () => Response.json({ code: "discovery_expired" }, { status: Number(status) })} navigate={navigate} />));
    await click("Connect this listing");
    expect(node.textContent).toContain(text); expect(node.textContent).not.toContain("Connect this listing"); expect(navigate).not.toHaveBeenCalled();
    if (status === 403) expect(node.textContent).not.toContain("Find your agency’s listings again");
  });
  it("retains the listing after network failures and rejects malformed or foreign redirects", async () => {
    const navigate = vi.fn(), request = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(Response.json({ url: "https://evil.example/" })).mockResolvedValueOnce(Response.json({ url: "javascript:alert(1)" }));
    await act(async () => root.render(<AgencyGooglePicker workspaceId={workspaceId} choices={choices} request={request} navigate={navigate} />));
    for (let index = 0; index < 3; index++) { await click("Connect this listing"); expect(node.textContent).toContain("Nothing on the listing changed"); expect(button("Connect this listing").disabled).toBe(false); }
    expect(navigate).not.toHaveBeenCalled();
  });
  it("holds all choices during one request and does not submit twice", async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn<typeof fetch>(() => new Promise<Response>(done => { resolve = done; }));
    await act(async () => root.render(<AgencyGooglePicker workspaceId={workspaceId} choices={choices} request={request} navigate={vi.fn()} />));
    await click("Connect this listing"); await click("Connect this listing");
    expect(button("Connect this listing").disabled).toBe(true); expect(button("Connect this listing").getAttribute("aria-busy")).toBe("true");
    expect(request).toHaveBeenCalledOnce();
    await act(async () => resolve(Response.json({}, { status: 503 })));
  });
});
