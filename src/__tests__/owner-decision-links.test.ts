import { afterEach, describe, expect, it, vi } from "vitest";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import { PostgresNeedsYouStore } from "@/platform/needs-you/repository";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { authorizeOwnerDecisionLinkRun, parseServiceSession, setServiceActorDb, startOwnerDecisionLinkSession, type ServiceSession } from "@/platform/needs-you/service-actor";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "b1000000-0000-4000-8000-000000000001";
const ITEM = "b1000000-0000-4000-8000-000000000002";
const ADMIN = { userId: "b1000000-0000-4000-8000-000000000003", verifiedEmail: "operator@example.test" };
const HASH = "a".repeat(64);
const EMAIL = "owner@example.test";
const ROUTINE = ["service_request", "website_document", "provider_delivery", "standing_responsibility", "work_responsibility", "application_release", "work_plan", "version_release", "business_record_draft"] as const;

async function setup(lifecycle: SourceAdapter["lifecycle"] = "service_request", kind: "request.scope" | "money" | "access.grant" | "exit" = "request.scope") {
  const mem = needsYouMemoryStore({ clock: { now: Date.now() } });
  const item = await mem.store.open(WS, { kind, route: "owner_decides", title: "Decide this exact change", approveEffect: "It changes.", notYetEffect: "Nothing changes.", sourceLifecycle: lifecycle, sourceId: ITEM, revisionHash: HASH, urgent: false, adminMayDecide: false });
  const session: ServiceSession = { kind: "strelva_system", label: "Strelva (system)", sessionId: ITEM, workspaceId: WS, purpose: "owner_decision_link", onBehalf: { role: "admin" }, actor: ADMIN, decisionId: item.id, revisionHash: HASH, recipient: EMAIL };
  const start = vi.fn(async () => session);
  const authorize = vi.fn(async () => {});
  mem.store.ownerLinkSession = start;
  mem.store.authorizeOwnerLinkRun = authorize;
  const resolve = vi.fn<SourceAdapter["resolve"]>(async () => ({ outcome: "done" as const }));
  const currentRevision = vi.fn(async () => HASH);
  const source: SourceAdapter = { lifecycle, needsMemberActor: true, ownerLinkWithoutAccount: true, propose: async () => ({ items: [], complete: true }), currentRevision, resolve };
  const send = vi.fn();
  const svc = createNeedsYouService({ store: mem.store, adapters: [source], sendEmail: send, appOrigin: "https://app.example.test", now: Date.now });
  const decide = (decision: "approve" | "not_yet" = "approve") => svc.decide({ workspaceId: WS, itemId: item.id, revision: HASH, decision, by: { kind: "owner_link", recipient: EMAIL } });
  return { mem, item, session, start, authorize, currentRevision, resolve, send, decide };
}

describe("account-free owner decisions", () => {
  it.each(ROUTINE)("%s uses the signed owner claim and unchanged admin execution identity", async lifecycle => {
    const s = await setup(lifecycle);
    expect(await s.decide()).toMatchObject({ status: "done", item: { state: "approved", decidedByKind: "owner_link" } });
    expect(s.start).toHaveBeenCalledWith(WS, s.item.id, HASH, EMAIL);
    expect(s.authorize).toHaveBeenCalledWith(s.session);
    expect(s.resolve).toHaveBeenCalledWith({ workspaceId: WS, actor: ADMIN }, expect.objectContaining({ state: "approved" }), "approve", { kind: "owner_link", recipient: EMAIL, actor: ADMIN, service: s.session });
    expect(s.authorize.mock.invocationCallOrder[0]).toBeLessThan(s.resolve.mock.invocationCallOrder[0]!);
    expect(s.send).not.toHaveBeenCalled();
    await expect(s.decide()).resolves.toMatchObject({ status: "already_handled" });
    expect(s.resolve).toHaveBeenCalledTimes(1);
  });

  it.each(["money", "access.grant", "exit"] as const)("%s still requires sign-in and never asks for service authority", async kind => {
    const s = await setup("service_request", kind);
    await expect(s.decide()).resolves.toMatchObject({ status: "sign_in" });
    expect(s.start).not.toHaveBeenCalled();
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it("stale source and stale item revisions run nothing", async () => {
    const s = await setup();
    s.currentRevision.mockResolvedValue("b".repeat(64));
    await expect(s.decide()).resolves.toMatchObject({ status: "changed" });
    expect(s.authorize).not.toHaveBeenCalled();
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it("revoked recipient or membership after claim records failure before the resolver", async () => {
    const s = await setup();
    s.authorize.mockRejectedValue(new Error("owner_decision_recipient_not_owner"));
    await expect(s.decide()).resolves.toMatchObject({ status: "failed", item: { outcomeReason: "link_authority_changed" } });
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it.each([{ workspaceId: ITEM }, { purpose: "needs_you_sync" as const }, { decisionId: ITEM }, { recipient: "someone@example.test" }, { revisionHash: "b".repeat(64) }])("refuses a session bound to different claims: %j", async mismatch => {
    const s = await setup();
    s.start.mockResolvedValue({ ...s.session, ...mismatch });
    await expect(s.decide()).resolves.toMatchObject({ status: "sign_in" });
    expect(s.authorize).not.toHaveBeenCalled();
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it("a declined item keeps its owner link authority and decision", async () => {
    const s = await setup();
    await expect(s.decide("not_yet")).resolves.toMatchObject({ status: "done", item: { state: "declined" } });
    expect(s.resolve.mock.calls[0]?.[2]).toBe("not_yet");
  });
});

const raw = { sessionId: ITEM, workspaceId: WS, purpose: "owner_decision_link", label: "Strelva (system)", role: "admin", userId: ADMIN.userId, verifiedEmail: ADMIN.verifiedEmail, decisionId: ITEM, revisionHash: HASH, recipient: EMAIL };
afterEach(() => { setServiceActorDb(null); vi.unstubAllEnvs(); });
describe("bound link storage and release gate", () => {
  it("the new flag defaults off and no session RPC is called", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_OWNER_DECISION_LINKS_RELEASE", "0");
    const rpc = vi.fn();
    setServiceActorDb({ rpc });
    await expect(PostgresNeedsYouStore.ownerLinkSession!(WS, ITEM, HASH, EMAIL)).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("parses required bindings and rejects malformed or mismatched DB responses", async () => {
    expect(parseServiceSession(raw)).toMatchObject({ decisionId: ITEM, revisionHash: HASH, recipient: EMAIL });
    expect(() => parseServiceSession({ ...raw, revisionHash: undefined })).toThrow(/malformed/);
    const rpc = vi.fn(async () => ({ data: { ...raw, recipient: "changed@example.test" }, error: null }));
    setServiceActorDb({ rpc });
    await expect(startOwnerDecisionLinkSession(WS, ITEM, HASH, EMAIL)).rejects.toThrow(/another decision/);
  });
  it("authorization carries every bound claim and refuses non-link purposes", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    setServiceActorDb({ rpc });
    const session = parseServiceSession(raw)!;
    await authorizeOwnerDecisionLinkRun(session);
    expect(rpc).toHaveBeenCalledWith("authorize_owner_decision_link_run", { p_workspace_id: WS, p_session_id: ITEM, p_decision_id: ITEM, p_revision_hash: HASH, p_recipient: EMAIL });
    await expect(authorizeOwnerDecisionLinkRun({ ...session, purpose: "needs_you_sync" })).rejects.toThrow(/can't decide/);
  });
});
