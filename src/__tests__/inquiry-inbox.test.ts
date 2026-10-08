import { afterEach, describe, expect, it, vi } from "vitest";
import { readWorkspaceInquiryInbox, type InboxDependencies } from "@/products/inquiries/workspace-inbox";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
const actor = { userId: "d0000000-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const workspace = "d0000000-0000-4000-8000-000000000010";
const base = { sites: [{ key: "fixture", tenantId: "fixture", siteName: "Fixture", leads: [], lastThirtyDays: 0, unavailable: false }], denied: [] };
function deps(rows: unknown[] = []): InboxDependencies { return { base: vi.fn(async () => base), source: vi.fn(async () => "postgres" as const), rpc: vi.fn(async () => rows) }; }
afterEach(() => vi.unstubAllEnvs());
describe("retained inquiry inbox", () => {
  it("flag off and parity not yet ready preserve the old read and response", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "");
    const d = deps(); expect(await readWorkspaceInquiryInbox(actor, workspace, undefined, d)).toBe(base); expect(d.rpc).not.toHaveBeenCalled(); expect(d.source).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); d.source = vi.fn(async () => "compare" as const);
    expect(await readWorkspaceInquiryInbox(actor, workspace, undefined, d)).toBe(base); expect(d.rpc).not.toHaveBeenCalled();
  });
  it("pages by captured time and row identity without leaking a denied site", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: `d0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, leadId: `lead_${i}`, tenantId: "fixture", name: "Dana", capturedAt: "2026-06-01T00:00:00Z", intakeState: "kept", fields: {} }));
    const d = deps(rows); const cursor = { before: "2026-10-01T00:00:00Z", beforeId: actor.userId };
    const result = await readWorkspaceInquiryInbox(actor, workspace, cursor, d);
    expect(result.sites[0]?.leads).toHaveLength(100); expect(result).toMatchObject({ durable: true, paged: true, nextPage: { before: rows[99]!.capturedAt, beforeId: rows[99]!.id } });
    expect(d.rpc).toHaveBeenCalledWith("read_workspace_inquiry_inbox_page", expect.objectContaining({ p_user_id: actor.userId, p_workspace_id: workspace, p_before: cursor.before, p_before_id: cursor.beforeId }), expect.any(Function));
    const markup = renderToStaticMarkup(WorkspaceInquiries({ workspaceId: workspace, state: { kind: "ready", data: result }, embedded: true }));
    expect(markup).toContain("Earlier inquiries"); expect(markup).not.toContain("last 30 days"); expect(markup).not.toContain("<main");
  });
  it("malformed storage is unavailable rather than a truncated or empty success", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    await expect(readWorkspaceInquiryInbox(actor, workspace, undefined, deps([{}]))).rejects.toThrow("malformed");
    const d = deps(); d.rpc = vi.fn(async () => { throw new Error("DB down"); });
    await expect(readWorkspaceInquiryInbox(actor, workspace, undefined, d)).rejects.toThrow("DB down");
  });
});
