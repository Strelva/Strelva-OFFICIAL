import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { receiving: { list: mocks.list } }; } }));
import { getReceivedEmailReadback } from "@/lib/email/send";
const input = { replyTo: "inquiry+test@reply.example.test", after: "2026-09-11T12:00:00Z", sender: "customer@example.test" };
const row = { id: "message-1", created_at: "2026-09-11T13:00:00Z", from: "other@example.test", to: [input.replyTo] };
function page(rows: unknown[], hasMore: unknown = false) { return { data: { data: rows, has_more: hasMore }, error: null }; }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("RESEND_API_KEY", "unit-test-key"); });
afterEach(() => vi.unstubAllEnvs());

describe("fresh receiving evidence", () => {
  it("checks subsequent pages and normalizes display-name addresses", async () => {
    mocks.list.mockResolvedValueOnce(page([row], true)).mockResolvedValueOnce(page([{ ...row, id: "message-2", created_at: "2026-09-11T12:30:00Z", from: "Customer <customer@example.test>" }]));
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "available", received: true, providerMessageId: "message-2" });
    expect(mocks.list).toHaveBeenNthCalledWith(2, { limit: 100, after: "message-1" });
  });
  it("allows a negative result only after a complete page or the ordered window ends", async () => {
    mocks.list.mockResolvedValueOnce(page([{ ...row, created_at: "2026-09-11T11:00:00Z" }], true));
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "available", received: false });
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
  it.each([
    page([{ ...row, created_at: "invalid" }]),
    page([{ ...row, to: null }]),
    page([{ ...row, from: "not an address" }]),
    page([], null),
    { data: { data: [] }, error: null },
    page([], true),
    page([row, { ...row, id: "later", created_at: "2026-09-11T14:00:00Z" }]),
  ])("does not turn malformed or incomplete evidence into permission to send", async (response) => {
    mocks.list.mockResolvedValue(response);
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "unavailable" });
  });
  it("blocks an incomplete bounded scan and repeated pagination ids", async () => {
    mocks.list.mockResolvedValueOnce(page([row], true)).mockResolvedValueOnce(page([row], true));
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "unavailable" });
    mocks.list.mockReset();
    for (let index = 0; index < 3; index++) mocks.list.mockResolvedValueOnce(page([{ ...row, id: `message-${index}` }], true));
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "unavailable" });
    expect(mocks.list).toHaveBeenCalledTimes(3);
  });
  it("does not call the provider with missing configuration or an invalid target", async () => {
    expect(await getReceivedEmailReadback({ ...input, replyTo: "not an address" })).toMatchObject({ status: "unavailable" });
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await getReceivedEmailReadback(input)).toMatchObject({ status: "unavailable" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
