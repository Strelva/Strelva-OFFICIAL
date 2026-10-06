import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRealPath, type LiveMakeRealPorts } from "@/experience/systems/live-make-real";
import { possibilityPreviewPath, signPossibilityPreviewToken, verifyPossibilityPreviewToken, POSSIBILITY_PREVIEW_TTL_MS } from "@/lib/possibility-preview-link";
import { possibilityTryState } from "@/experience/systems/try-state";

const WS = "d1000000-0000-4000-8000-000000000001";
const P = "d1000000-0000-4000-8000-0000000000p1".replace("p", "a");
const OWNER = { userId: "d1000000-0000-4000-8000-0000000000a9", verifiedEmail: "owner@mooney.test" };

function ports(over: Partial<LiveMakeRealPorts> = {}): LiveMakeRealPorts {
  return {
    isStored: (id) => /^[0-9a-f-]{36}$/.test(id),
    sourceRef: async () => ({ found: true, sourceRef: "website-rebuild:w1", status: "ready" }),
    liveEnabled: async () => false,
    approve: async () => ({ status: "done_unverified", reason: "Partly live", activationId: "act-1" }),
    ...over,
  };
}

describe("which Make real path a tap takes", () => {
  it("keeps per-request rebuilds isolated, and stored ones isolated until a live channel is on", async () => {
    await expect(makeRealPath(OWNER, WS, "website-rebuild:w1", ports())).resolves.toEqual({ kind: "isolated", possibilityId: "website-rebuild:w1" });
    await expect(makeRealPath(OWNER, WS, P, ports())).resolves.toEqual({ kind: "isolated", possibilityId: "website-rebuild:w1" });
    await expect(makeRealPath(OWNER, WS, P, ports({ sourceRef: async () => ({ found: false }) }))).resolves.toBeNull();
    await expect(makeRealPath(OWNER, WS, P, ports({ sourceRef: async () => ({ found: true, sourceRef: null, status: "ready" }) }))).resolves.toBeNull();
  });

  it("with a live channel on, the owner's tap is the Needs you decision and starts the activation", async () => {
    const approve = vi.fn(async () => ({ status: "done_unverified", reason: "Partly live", activationId: "act-1" }));
    await expect(makeRealPath(OWNER, WS, P, ports({ liveEnabled: async () => true, approve }))).resolves.toEqual({ kind: "live", result: { live: true, status: "done_unverified", headline: "Partly live", activationId: "act-1" } });
    expect(approve).toHaveBeenCalledWith(OWNER, WS, P);
    await expect(makeRealPath(OWNER, WS, P, ports({ liveEnabled: async () => true, approve: async () => ({ status: "done", reason: null, activationId: "act-2" }) }))).resolves.toMatchObject({ result: { headline: "Live." } });
    await expect(makeRealPath(OWNER, WS, P, ports({ liveEnabled: async () => true, approve: async () => ({ status: "changed", reason: null, activationId: null }) }))).resolves.toMatchObject({ result: { headline: expect.stringMatching(/changed since/) } });
  });

  it("never approves what is not Ready, or when nothing waits on the owner", async () => {
    const approve = vi.fn(async () => null);
    await expect(makeRealPath(OWNER, WS, P, ports({ liveEnabled: async () => true, approve, sourceRef: async () => ({ found: true, sourceRef: "website-rebuild:w1", status: "exploring" }) })))
      .resolves.toMatchObject({ kind: "live", result: { status: "not_ready" } });
    expect(approve).not.toHaveBeenCalled();
    await expect(makeRealPath(OWNER, WS, P, ports({ liveEnabled: async () => true, approve }))).resolves.toMatchObject({ result: { status: "not_ready", activationId: null } });
  });
});

describe("signed Try it links", () => {
  beforeEach(() => vi.stubEnv("APPROVE_LINK_SECRET", "test-secret-only-for-this-suite"));
  afterEach(() => vi.unstubAllEnvs());
  const claims = { workspaceId: WS, possibilityId: P, candidateRevision: 3 };

  it("binds workspace, possibility and candidate revision, and expires with the Needs you link", () => {
    const now = Date.parse("2026-10-06T12:00:00.000Z");
    const token = signPossibilityPreviewToken(claims, now);
    expect(verifyPossibilityPreviewToken(token, now + 1000)).toEqual(claims);
    expect(verifyPossibilityPreviewToken(token, now + POSSIBILITY_PREVIEW_TTL_MS + 1)).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), candidateRevision: 4 })).toString("base64url");
    expect(verifyPossibilityPreviewToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifyPossibilityPreviewToken("garbage", now)).toBeNull();
    expect(possibilityPreviewPath(claims, now)).toMatch(/^\/try\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(possibilityPreviewPath(claims, now).length).toBeLessThan(500);
  });

  it("shows only an open candidate of the same revision; a new candidate kills old links", async () => {
    const token = signPossibilityPreviewToken(claims);
    const read = vi.fn(async ({ candidateRevision }: { candidateRevision: number }) => candidateRevision === 3 ? {
      title: "Consult booking", intent: "Add consult booking beside the contact form.",
      changes: [{ candidate: { summary: "the site with a booking page", content: { form: "consults" } } }], introduces: [{ name: "Consult booking" }], effects: [{ channel: "booking_page" }],
    } : null);
    await expect(possibilityTryState(token, { enabled: async () => true, read })).resolves.toEqual({ kind: "ready", view: {
      title: "Consult booking", intent: "Add consult booking beside the contact form.", changes: ["The site with a booking page"], introduces: ["Consult booking"], takesSubmissions: true,
    } });
    const old = signPossibilityPreviewToken({ ...claims, candidateRevision: 2 });
    await expect(possibilityTryState(old, { enabled: async () => true, read })).resolves.toEqual({ kind: "changed" });
    await expect(possibilityTryState("tampered.token", { enabled: async () => true, read })).resolves.toEqual({ kind: "expired" });
    await expect(possibilityTryState(token, { enabled: async () => false, read })).resolves.toBeNull();
  });
});
