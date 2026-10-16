import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ unsubscribe: vi.fn(), limited: vi.fn() }));
vi.mock("@/lib/newsletter-unsubscribe", () => ({ verifyUnsubscribeToken: (token: string) => token === "signed-fixture" ? { tenantId: "fixture-tenant", email: "private-reader@example.test" } : null }));
vi.mock("@/lib/storage/newsletter-store", () => ({ unsubscribeSubscriber: mocks.unsubscribe }));
vi.mock("@/platform/infra/rate-limit", () => ({ rateLimitKey: () => "fixture-key", isRateLimitedAsync: mocks.limited }));
import { GET, POST } from "@/app/api/newsletter/unsubscribe/route";
const request = (method: string, token = "signed-fixture") => new Request(`https://example.test/api/newsletter/unsubscribe?token=${token}`, { method });
beforeEach(() => { mocks.unsubscribe.mockReset().mockResolvedValue(undefined); mocks.limited.mockReset().mockResolvedValue(false); });

describe("unsubscribe paper document preserves its privacy and failure contract", () => {
  it("GET offers a POST confirmation and never mutates or discloses the signed address", async () => {
    const response = await GET(request("GET")); const html = await response.text();
    expect(html).toContain('method="post"'); expect(html).toContain("Stop getting this newsletter?");
    expect(html).not.toContain("private-reader"); expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("success has no invented business name or undo route", async () => {
    const response = await POST(request("POST")); const html = await response.text();
    expect(response.status).toBe(200); expect(html).toContain("You&#39;re off the list");
    expect(html).not.toContain("Undo"); expect(html).not.toContain("private-reader");
    expect(mocks.unsubscribe).toHaveBeenCalledWith("private-reader@example.test", "fixture-tenant");
  });
  it.each([GET, POST])("refuses invalid tokens before mutation", async method => {
    const response = await method(request(method === GET ? "GET" : "POST", "invalid"));
    expect(response.status).toBe(400); expect(await response.text()).toContain("This link doesn&#39;t work");
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
  });
  it("rate-limit and storage failure do not claim success", async () => {
    mocks.limited.mockResolvedValueOnce(true);
    const limited = await POST(request("POST")); expect(limited.status).toBe(429); expect(mocks.unsubscribe).not.toHaveBeenCalled();
    mocks.unsubscribe.mockRejectedValueOnce(new Error("Unavailable"));
    const failed = await POST(request("POST")); const html = await failed.text();
    expect(failed.status).toBe(503); expect(html).toContain("That didn&#39;t go through"); expect(html).not.toContain("You&#39;re off the list");
  });
});
