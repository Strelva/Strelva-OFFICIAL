import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  actor: vi.fn(), released: vi.fn(() => true), limited: vi.fn(async () => false),
  list: vi.fn(), issue: vi.fn(), note: vi.fn(), publish: vi.fn(), revoke: vi.fn(), record: vi.fn(), voidTime: vi.fn(), listTime: vi.fn(),
  generate: vi.fn(), read: vi.fn(), send: vi.fn(),
}));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: m.released }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: m.limited }));
vi.mock("@/platform/workspaces/http", async () => ({ ...(await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http")), workspaceHttpActor: m.actor }));
vi.mock("@/platform/care-reports/service", () => ({
  listCareReports: m.list, issueCareReportShareLink: m.issue, saveCareReportNote: m.note, publishCareReport: m.publish, revokeCareReportShareLink: m.revoke,
  recordAgencyClientTime: m.record, voidAgencyClientTime: m.voidTime, listAgencyClientTime: m.listTime,
}));
vi.mock("@/server/care-reports/server", () => ({ generateAgencyCareReports: m.generate, readCareReportForViewer: m.read, sendCareReport: m.send }));

import { GET, POST } from "@/app/api/workspace/care-reports/route";
import { GET as reportGet, POST as reportPost } from "@/app/api/workspace/care-reports/[reportId]/route";
import { DELETE as timeDelete, GET as timeGet, POST as timePost } from "@/app/api/workspace/agency-client-time/route";
import { currentCareMonth } from "@/platform/care-reports/model";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const AGENCY = "28100000-0000-4000-8000-000000000020";
const WS = "28100000-0000-4000-8000-000000000010";
const REPORT = "28100000-0000-4000-8000-0000000000c0";
const actor = { userId: "28100000-0000-4000-8000-000000000003", verifiedEmail: "agency@example.test" };
const base = "http://localhost:3000";
const post = (path: string, value: unknown, method = "POST") =>
  new Request(`${base}${path}`, { method, headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify(value) });
const ctx = (reportId = REPORT) => ({ params: Promise.resolve({ reportId }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_CARE_REPORTS_RELEASE", "workspace");
  vi.stubEnv("STRELVA_CARE_REPORT_EMAIL", "");
  vi.stubEnv("STRELVA_CARE_REPORT_SHARE_LINKS", "");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  m.released.mockReturnValue(true);
  m.limited.mockResolvedValue(false);
  m.actor.mockResolvedValue(actor);
  m.list.mockResolvedValue({ agencyWorkspaceId: AGENCY, month: "2026-09", canGenerate: true, clients: [] });
  m.generate.mockResolvedValue({ generated: 0, reports: [], skipped: [] });
  m.read.mockResolvedValue({ audience: "agency" });
  m.issue.mockResolvedValue({ createdAt: "2026-10-15T00:00:00Z" });
  m.send.mockResolvedValue({ status: "suppressed", reason: "email_off" });
});

describe("Care plan report routes", () => {
  it("answer 503 with either release switch off, before reading anything", async () => {
    for (const setup of [() => m.released.mockReturnValue(false), () => vi.stubEnv("STRELVA_CARE_REPORTS_RELEASE", "0")]) {
      setup();
      expect((await GET(new Request(`${base}/api/workspace/care-reports?agencyWorkspaceId=${AGENCY}`))).status).toBe(503);
      expect((await POST(post("/api/workspace/care-reports", { agencyWorkspaceId: AGENCY, month: "2026-09" }))).status).toBe(503);
      expect((await reportGet(new Request(base), ctx())).status).toBe(503);
      expect((await reportPost(post("/x", { action: "publish", expectedRevision: 1 }), ctx())).status).toBe(503);
      expect((await timeGet(new Request(base))).status).toBe(503);
      expect((await timePost(post("/x", {}))).status).toBe(503);
      expect((await timeDelete(post("/x", {}, "DELETE"))).status).toBe(503);
    }
    for (const fn of Object.values(m)) if (fn !== m.released && fn !== m.limited && fn !== m.actor) expect(fn).not.toHaveBeenCalled();
  });

  it("needs a signed-in actor", async () => {
    m.actor.mockResolvedValue(null);
    expect((await GET(new Request(`${base}/api/workspace/care-reports?agencyWorkspaceId=${AGENCY}`))).status).toBe(401);
    expect((await reportGet(new Request(base), ctx())).status).toBe(401);
    expect((await timeGet(new Request(base))).status).toBe(401);
  });

  it("defaults the list to last month and refuses a bad or future month", async () => {
    const ok = await GET(new Request(`${base}/api/workspace/care-reports?agencyWorkspaceId=${AGENCY}`));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ emailOn: false, shareLinksOn: false });
    expect(m.list).toHaveBeenCalledWith(actor, AGENCY, expect.stringMatching(/^\d{4}-\d{2}$/));
    expect((await GET(new Request(`${base}/api/workspace/care-reports?agencyWorkspaceId=${AGENCY}&month=2026-13`))).status).toBe(400);
    expect((await GET(new Request(`${base}/api/workspace/care-reports?agencyWorkspaceId=${AGENCY}&month=2099-01`))).status).toBe(400);
    expect((await POST(post("/api/workspace/care-reports", { agencyWorkspaceId: AGENCY, month: "2099-01" }))).status).toBe(400);
    expect(m.generate).not.toHaveBeenCalled();
  });

  it("generates for the session actor and rate limits", async () => {
    const month = currentCareMonth();
    expect((await POST(post("/api/workspace/care-reports", { agencyWorkspaceId: AGENCY, month, workspaceIds: [WS] }))).status).toBe(200);
    expect(m.generate).toHaveBeenCalledWith(actor, { agencyWorkspaceId: AGENCY, month, workspaceIds: [WS] }, { operator: false, tester: false, userId: actor.userId });
    m.limited.mockResolvedValue(true);
    const limited = await POST(post("/api/workspace/care-reports", { agencyWorkspaceId: AGENCY, month }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Please wait before generating again." });
  });

  it("answers 404 for a report id that is not a uuid", async () => {
    expect((await reportGet(new Request(base), ctx("nope"))).status).toBe(404);
    expect((await reportPost(post("/x", { action: "publish", expectedRevision: 1 }), ctx("nope"))).status).toBe(404);
  });

  it("holds share links off, and with them on returns the token once", async () => {
    const request = () => post("/x", { action: "share_link" });
    const off = await reportPost(request(), ctx());
    expect(off.status).toBe(503);
    expect(m.issue).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_CARE_REPORT_SHARE_LINKS", "1");
    const on = await reportPost(request(), ctx());
    expect(on.status).toBe(200);
    const { url } = await on.json() as { url: string };
    expect(url).toMatch(/^https:\/\/app\.example\.test\/care-reports\/[A-Za-z0-9_-]{43}$/);
    expect(m.issue).toHaveBeenCalledWith(actor, REPORT, expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(m.issue.mock.calls)).not.toContain(url.split("/").pop());
  });

  it("never echoes a token on other actions", async () => {
    m.revoke.mockResolvedValue({ revoked: true });
    const response = await reportPost(post("/x", { action: "revoke_link" }), ctx());
    expect(await response.json()).toEqual({ revoked: true });
  });

  it("explains a held send in plain words", async () => {
    const response = await reportPost(post("/x", { action: "send", release: 1 }), ctx());
    expect(await response.json()).toEqual({ status: "suppressed", reason: "email_off", line: "Not sent: email is off. Copy the link and send it yourself." });
    expect(m.send).toHaveBeenCalledWith(actor, REPORT, 1, "https://app.example.test");
  });

  it("maps a conflict to 409 and a bad action to 400", async () => {
    m.publish.mockRejectedValue(new WorkspaceConflictError("This report changed since you opened it. Reload, then try again."));
    expect((await reportPost(post("/x", { action: "publish", expectedRevision: 2 }), ctx())).status).toBe(409);
    expect((await reportPost(post("/x", { action: "delete" }), ctx())).status).toBe(400);
  });

  it("records and voids agency time as the session actor", async () => {
    m.record.mockResolvedValue({ id: REPORT });
    const entry = { agencyWorkspaceId: AGENCY, workspaceId: WS, id: REPORT, minutes: 30, category: "change", occurredOn: "2026-10-05" };
    expect((await timePost(post("/x", entry))).status).toBe(200);
    expect(m.record).toHaveBeenCalledWith(actor, entry);
    expect((await timePost(post("/x", { ...entry, minutes: 0 }))).status).toBe(400);
    m.voidTime.mockResolvedValue({ voided: true });
    expect((await timeDelete(post("/x", { agencyWorkspaceId: AGENCY, id: REPORT, reason: "Entered twice" }, "DELETE"))).status).toBe(200);
    m.listTime.mockResolvedValue([]);
    expect((await timeGet(new Request(`${base}/api/workspace/agency-client-time?agencyWorkspaceId=${AGENCY}&workspaceId=${WS}&month=2026-10`))).status).toBe(200);
  });
});
