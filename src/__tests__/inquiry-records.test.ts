import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

const redis = makeRedisMock();
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), sendNewLeadEmail: vi.fn(), alertOnce: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: mocks.sendNewLeadEmail }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: mocks.alertOnce }));

import { setLeadMirrorDb, type LeadMirrorDb } from "@/lib/lead-mirror";
import {
  INQUIRY_RECORDS_TIMEOUT_MS,
  InquiryRecordsError,
  copyInquiryEvent,
  followUpLeadCapture,
  holdSpamForReview,
  inquiryRecordsEnabled,
  setInquiryRecordsDb,
} from "@/lib/inquiry-records";
import { decideHeldInquiry, parseWorkspaceLead, readInquiryEvents, readWorkspaceInquiryLeads } from "@/products/inquiries/workspace-records";
import { captureLead } from "@/lib/leads";
import { recordSpam } from "@/lib/spam-pit";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

type Rpc = (name: string, args: Record<string, unknown>) => unknown;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
function useDb(impl: Rpc) {
  rpc = vi.fn<Rpc>(impl);
  setInquiryRecordsDb({ rpc } as unknown as LeadMirrorDb);
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
}
const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name).map(([, args]) => args);

const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: " Owner@Example.test " };
const WS = "7f000000-0000-4000-8000-000000000010";
const ROW = "7f000000-0000-4000-8000-0000000000d1";
const leadRow = (patch: Record<string, unknown> = {}) => ({
  id: ROW, tenantId: "mclears", leadId: "lead_spam_one", name: "Buy now", email: "bot@example.test", message: "cheap", source: "v1-leads",
  fields: { phone: "1", junk: 5 }, intakeState: "held_as_spam", heldReason: "honeypot", intakeStateAt: null, contactId: null,
  capturedAt: "2026-10-06T10:00:00.000Z", ...patch,
});

beforeEach(() => {
  vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
  redis.store.clear();
  redis.zsets.clear();
  mocks.tenant.mockReset();
  mocks.tenant.mockResolvedValue({ id: "mclears", siteName: "McClear's", ownerEmail: "owner@example.test", active: true });
  mocks.sendNewLeadEmail.mockReset();
  mocks.sendNewLeadEmail.mockResolvedValue(false);
  mocks.alertOnce.mockReset();
  useDb(async () => ({ data: { status: "recorded" }, error: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  setInquiryRecordsDb(undefined);
  setLeadMirrorDb(undefined);
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the switch", () => {
  it("is off unless STRELVA_INQUIRY_RECORDS=1, and DUAL_WRITE_PG=0 turns it off", async () => {
    expect(inquiryRecordsEnabled({})).toBe(false);
    expect(inquiryRecordsEnabled({ STRELVA_INQUIRY_RECORDS: "1" })).toBe(true);
    vi.stubEnv("DUAL_WRITE_PG", "0");
    expect(inquiryRecordsEnabled({ STRELVA_INQUIRY_RECORDS: "1" })).toBe(false);
  });

  it("writes nothing when off", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "");
    expect(await holdSpamForReview("mclears", { id: "spam_a", reason: "honeypot", createdAt: "2026-10-06T10:00:00Z" })).toBe("off");
    expect(await followUpLeadCapture("mclears", "lead_a")).toEqual({ status: "off" });
    expect(await copyInquiryEvent({ tenantId: "mclears", inquiryId: "lead_a", kind: "delivery", dedupeKey: "d" })).toBe("off");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("held spam", () => {
  it("holds the pit record in tenant_leads, bounded to the store's limits", async () => {
    expect(await holdSpamForReview("mclears", { id: "spam_a", reason: "honeypot", name: "Bot", message: "x".repeat(6000), createdAt: "2026-10-06T10:00:00Z" })).toBe("recorded");
    const [args] = calls("hold_tenant_lead_as_spam");
    expect(args).toMatchObject({ p_tenant_id: "mclears", p_spam: { id: "spam_a", reason: "honeypot", name: "Bot", createdAt: "2026-10-06T10:00:00Z" } });
    expect(((args!.p_spam as Record<string, string>).message)).toHaveLength(5000);
  });

  it("never throws: a refusal, a thrown client or a timeout is `failed`", async () => {
    useDb(async () => ({ data: null, error: { message: "inquiry_record_invalid" } }));
    expect(await holdSpamForReview("mclears", { id: "spam_a", reason: "x", createdAt: "2026-10-06T10:00:00Z" })).toBe("failed");
    useDb(() => { throw new Error("socket"); });
    expect(await holdSpamForReview("mclears", { id: "spam_a", reason: "x", createdAt: "2026-10-06T10:00:00Z" })).toBe("failed");
    vi.useFakeTimers();
    useDb(() => new Promise(() => {}));
    const pending = holdSpamForReview("mclears", { id: "spam_a", reason: "x", createdAt: "2026-10-06T10:00:00Z" });
    await vi.advanceTimersByTimeAsync(INQUIRY_RECORDS_TIMEOUT_MS + 1);
    expect(await pending).toBe("failed");
    setInquiryRecordsDb(null);
    expect(await holdSpamForReview("mclears", { id: "spam_a", reason: "x", createdAt: "2026-10-06T10:00:00Z" })).toBe("failed");
  });

  it("the spam pit holds every caught submission for review and keeps its Redis copy when Postgres fails", async () => {
    const record = await recordSpam("mclears", { reason: "honeypot", name: "Bot", email: "bot@example.test" });
    expect(record).not.toBeNull();
    expect(calls("hold_tenant_lead_as_spam")[0]).toMatchObject({ p_tenant_id: "mclears", p_spam: { id: record!.id, reason: "honeypot", name: "Bot" } });
    useDb(async () => { throw new Error("postgres down"); });
    const second = await recordSpam("mclears", { reason: "turnstile" });
    expect(second).not.toBeNull();
    expect(redis.store.has(`reb:spam-pit:item:mclears:${second!.id}`)).toBe(true);
  });
});

describe("capture follow-up (contact and captured event)", () => {
  it("runs after Postgres keeps a new lead and maps the contact outcome", async () => {
    useDb(async (name) => name === "after_tenant_lead_capture"
      ? { data: { status: "recorded", contactId: "c1", contact: "created" }, error: null }
      : { data: { status: "recorded", id: "row", workspaceId: WS }, error: null });
    const result = await captureLead("mclears", { name: "Dana", email: "dana@example.test", message: "Party for 30?" });
    expect(result.status).toBe("captured");
    const lead = result.status === "captured" ? result.lead : null;
    expect(calls("after_tenant_lead_capture")).toEqual([{ p_tenant_id: "mclears", p_lead_id: lead!.id }]);
    expect(await followUpLeadCapture("mclears", "lead_x")).toEqual({ status: "recorded", contactId: "c1", contact: "created" });
  });

  it("never fails the visitor when the follow-up fails", async () => {
    useDb(async (name) => name === "after_tenant_lead_capture"
      ? { data: null, error: { message: "boom" } }
      : { data: { status: "recorded", id: "row", workspaceId: WS }, error: null });
    expect((await captureLead("mclears", { name: "Dana", email: "dana@example.test" })).status).toBe("captured");
    expect(await followUpLeadCapture("mclears", "lead_x")).toEqual({ status: "failed" });
  });

  it("skips the follow-up when Postgres didn't keep a new lead, and for a malformed id", async () => {
    useDb(async () => ({ data: null, error: { message: "tenant_lead_invalid" } }));
    await captureLead("mclears", { name: "Dana" });
    expect(calls("after_tenant_lead_capture")).toHaveLength(0);
    expect(await followUpLeadCapture("mclears", "not-a-lead")).toEqual({ status: "off" });
  });

  it("is off with the switch off: capture behaves exactly as before", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "0");
    useDb(async () => ({ data: { status: "recorded", id: "row", workspaceId: null }, error: null }));
    expect((await captureLead("mclears", { name: "Dana" })).status).toBe("captured");
    expect(rpc.mock.calls.map(([n]) => n)).toEqual(["record_tenant_lead"]);
  });
});

describe("inquiry events", () => {
  it("copies with an idempotency key, hashing long keys and truncating large detail", async () => {
    expect(await copyInquiryEvent({ tenantId: "mclears", inquiryId: "lead_a", kind: "timeline", detail: { x: "y".repeat(9000) }, dedupeKey: "k".repeat(300) })).toBe("recorded");
    const [args] = calls("record_inquiry_event");
    expect(args).toMatchObject({ p_kind: "timeline", p_actor: "strelva", p_detail: { truncated: true } });
    expect(String(args!.p_dedupe_key)).toMatch(/^[a-f0-9]{64}$/);
    useDb(async () => ({ data: { status: "exists" }, error: null }));
    expect(await copyInquiryEvent({ tenantId: "mclears", inquiryId: "lead_a", kind: "reply", dedupeKey: "reply:1" })).toBe("exists");
    useDb(async () => ({ data: null, error: { message: "inquiry_record_unknown_tenant" } }));
    expect(await copyInquiryEvent({ tenantId: "gone", inquiryId: "lead_a", kind: "delivery", dedupeKey: "d" })).toBe("failed");
    // Engine ids that aren't lead ids are not copied.
    expect(await copyInquiryEvent({ tenantId: "mclears", inquiryId: "inq-1", kind: "delivery", dedupeKey: "d" })).toBe("off");
  });

  it("reads one inquiry's events for a member", async () => {
    useDb(async () => ({ data: [{ kind: "held_as_spam", actor: "system", detail: { reason: "honeypot" }, at: "2026-10-06T10:00:00.000Z" }, { bad: true }], error: null }));
    expect(await readInquiryEvents(ACTOR, WS, ROW)).toEqual([{ kind: "held_as_spam", actor: "system", detail: { reason: "honeypot" }, at: "2026-10-06T10:00:00.000Z" }]);
    expect(calls("read_workspace_inquiry_events")[0]).toMatchObject({ p_verified_email: "owner@example.test", p_lead_row_id: ROW });
  });
});

describe("workspace read and review", () => {
  it("reads by workspace with the verified email, and drops malformed rows", async () => {
    useDb(async () => ({ data: [leadRow(), { id: "x" }, leadRow({ intakeState: "deleted" })], error: null }));
    const rows = await readWorkspaceInquiryLeads(ACTOR, WS, { states: ["held_as_spam"], before: "2026-10-07T00:00:00Z" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ROW, intakeState: "held_as_spam", fields: { phone: "1" } });
    expect(calls("read_workspace_leads")[0]).toEqual({ p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "owner@example.test",
      p_states: ["held_as_spam"], p_limit: 100, p_before: "2026-10-07T00:00:00Z" });
  });

  it("turns a database refusal into WorkspaceAccessError and a malformed answer into an error", async () => {
    useDb(async () => ({ data: null, error: { message: "inquiry_access_denied" } }));
    await expect(readWorkspaceInquiryLeads(ACTOR, WS)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(decideHeldInquiry(ACTOR, WS, ROW, "release")).rejects.toBeInstanceOf(WorkspaceAccessError);
    useDb(async () => ({ data: { nope: 1 }, error: null }));
    await expect(readWorkspaceInquiryLeads(ACTOR, WS)).rejects.toBeInstanceOf(InquiryRecordsError);
  });

  it("decides and maps not found and not held", async () => {
    useDb(async () => ({ data: { status: "decided", lead: leadRow({ intakeState: "released" }) }, error: null }));
    expect(await decideHeldInquiry(ACTOR, WS, ROW, "release")).toMatchObject({ status: "decided", lead: { intakeState: "released" } });
    expect(calls("decide_held_workspace_lead")[0]).toMatchObject({ p_lead_row_id: ROW, p_decision: "release" });
    useDb(async () => ({ data: null, error: { message: "inquiry_not_found" } }));
    await expect(decideHeldInquiry(ACTOR, WS, ROW, "hold")).rejects.toMatchObject({ code: "not_found" });
    useDb(async () => ({ data: null, error: { message: "inquiry_not_held" } }));
    await expect(decideHeldInquiry(ACTOR, WS, ROW, "confirm_spam")).rejects.toMatchObject({ code: "not_held" });
  });

  it("parses only known states", () => {
    expect(parseWorkspaceLead(leadRow({ intakeState: "released" }))?.intakeState).toBe("released");
    expect(parseWorkspaceLead(leadRow({ intakeState: "gone" }))).toBeNull();
    expect(parseWorkspaceLead(null)).toBeNull();
  });
});
