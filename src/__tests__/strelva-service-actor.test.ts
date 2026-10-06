/**
 * Strelva (system) sessions from TypeScript: parsing what SQL returns,
 * refusing a session for another business or purpose, the Make real resume
 * log, and who the workspace-work cron runs each activation as.
 * The SQL side is tests/strelva-service-actor-schema.sql.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));

import { parseServiceSession, recordServiceAction, setServiceActorDb, startServiceSession, type ServiceSession } from "@/platform/needs-you/service-actor";
import { activationRunner, listDueActivations } from "@/platform/make-real/live-server";

const WS = "dddddddd-0000-4000-8000-000000000001";
const WS2 = "dddddddd-0000-4000-8000-000000000002";
const WS3 = "dddddddd-0000-4000-8000-000000000003";
const ADMIN = { userId: "dddddddd-0000-4000-8000-0000000000a1", verifiedEmail: "operator@strelva.test" };
const STARTER = { userId: "dddddddd-0000-4000-8000-0000000000a2", verifiedEmail: "owner@example.test" };

function row(workspaceId = WS, purpose = "needs_you_sync") {
  return { sessionId: "dddddddd-0000-4000-8000-0000000000c1", workspaceId, purpose, label: "Strelva (system)", role: "admin", userId: ADMIN.userId, verifiedEmail: "Operator@Strelva.test" };
}
function session(workspaceId: string): ServiceSession {
  return { kind: "strelva_system", label: "Strelva (system)", sessionId: "dddddddd-0000-4000-8000-0000000000c2", workspaceId, purpose: "make_real_resume", onBehalf: { role: "admin" }, actor: ADMIN };
}

beforeEach(() => rpc.mockReset());
afterEach(() => setServiceActorDb(null));

describe("service sessions", () => {
  it("parses a session as Strelva (system) acting through the member identity SQL picked", () => {
    expect(parseServiceSession(row())).toEqual({
      kind: "strelva_system", label: "Strelva (system)", sessionId: row().sessionId, workspaceId: WS, purpose: "needs_you_sync",
      onBehalf: { role: "admin" }, actor: { userId: ADMIN.userId, verifiedEmail: "operator@strelva.test" },
    });
    expect(parseServiceSession(null)).toBeNull();
    expect(() => parseServiceSession({ ...row(), label: "Someone else" })).toThrow(/malformed/);
  });

  it("starts one per business and purpose, and refuses a session for another business", async () => {
    rpc.mockResolvedValueOnce({ data: row(), error: null });
    await expect(startServiceSession(WS, "needs_you_sync")).resolves.toMatchObject({ workspaceId: WS });
    expect(rpc).toHaveBeenCalledWith("strelva_service_reader", { p_workspace_id: WS, p_purpose: "needs_you_sync" });
    rpc.mockResolvedValueOnce({ data: row(WS2), error: null });
    await expect(startServiceSession(WS, "needs_you_sync")).rejects.toThrow(/another business/);
    rpc.mockResolvedValueOnce({ data: row(WS, "make_real_resume"), error: null });
    await expect(startServiceSession(WS, "needs_you_sync")).rejects.toThrow(/another business/);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(startServiceSession(WS, "needs_you_sync")).resolves.toBeNull();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "strelva_service_invalid" } });
    await expect(startServiceSession(WS, "needs_you_sync")).rejects.toThrow(/could not start/);
    await expect(startServiceSession("not-a-uuid", "needs_you_sync")).rejects.toThrow();
  });

  it("logs a Make real step only under a make_real_resume session, and a failed log is an error", async () => {
    rpc.mockResolvedValueOnce({ data: "id", error: null });
    await recordServiceAction(session(WS), "resume", "activation:act-1", "Resumed.");
    expect(rpc).toHaveBeenCalledWith("record_strelva_service_action", { p_workspace_id: WS, p_session_id: session(WS).sessionId, p_action: "resume", p_subject: "activation:act-1", p_detail: "Resumed." });
    await expect(recordServiceAction({ ...session(WS), purpose: "needs_you_sync" }, "resume", "activation:act-1")).rejects.toThrow(/can't run Make real/);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "strelva_service_access_denied" } });
    await expect(recordServiceAction(session(WS), "run", "activation:act-1")).rejects.toThrow(/did not run/);
  });
});

describe("who the workspace-work cron runs each activation as", () => {
  it("Strelva (system) where Strelva runs the business; the starter elsewhere; nobody when neither", async () => {
    rpc.mockResolvedValueOnce({ data: [
      { workspaceId: WS, activationId: "a1", starterUserId: null, starterEmail: null },
      { workspaceId: WS, activationId: "a2", starterUserId: STARTER.userId, starterEmail: STARTER.verifiedEmail },
      { workspaceId: WS2, activationId: "b1", starterUserId: STARTER.userId, starterEmail: STARTER.verifiedEmail },
      { workspaceId: WS3, activationId: "c1", starterUserId: null, starterEmail: null },
    ], error: null });
    const startSession = vi.fn(async (workspaceId: string) => workspaceId === WS ? session(WS) : null);
    const due = await listDueActivations(20, { startSession });
    expect(rpc).toHaveBeenCalledWith("due_make_real_activations_for_service", { p_limit: 20, p_grace_seconds: 120 });
    expect(due).toEqual([
      { workspaceId: WS, activationId: "a1", actor: ADMIN, service: session(WS) },
      { workspaceId: WS, activationId: "a2", actor: ADMIN, service: session(WS) },
      { workspaceId: WS2, activationId: "b1", actor: STARTER },
    ]);
    // One session per business.
    expect(startSession).toHaveBeenCalledTimes(3);
  });

  it("a session that fails to start falls back to the starter", async () => {
    rpc.mockResolvedValueOnce({ data: [{ workspaceId: WS, activationId: "a1", starterUserId: STARTER.userId, starterEmail: STARTER.verifiedEmail }], error: null });
    const due = await listDueActivations(20, { startSession: async () => { throw new Error("down"); } });
    expect(due).toEqual([{ workspaceId: WS, activationId: "a1", actor: STARTER }]);
  });

  it("refuses a malformed due list", async () => {
    rpc.mockResolvedValueOnce({ data: [{ workspaceId: WS }], error: null });
    await expect(listDueActivations(20, { startSession: async () => null })).rejects.toThrow(/malformed/);
  });

  it("operator tools: Strelva (system) first, the starter otherwise", async () => {
    await expect(activationRunner(WS, "a1", { startSession: async () => session(WS), starter: async () => STARTER })).resolves.toEqual({ actor: ADMIN, service: session(WS) });
    await expect(activationRunner(WS, "a1", { startSession: async () => null, starter: async () => STARTER })).resolves.toEqual({ actor: STARTER, service: null });
    await expect(activationRunner(WS, "a1", { startSession: async () => null, starter: async () => null })).resolves.toBeNull();
  });
});
