import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "@/platform/app-events/contracts";
import { postPinned } from "@/platform/app-events/transport";
import {
  newWebhookSecret,
  sendAppEventWebhook,
  signAppEventWebhook,
  validateWebhookUrl,
  verifyAppEventSignature,
  webhookBody,
  type WebhookTarget,
} from "@/platform/app-events/webhooks";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import { WorkspaceConflictError } from "@/platform/workspaces/types";

const EVENT: AppEvent = {
  id: "28100000-0000-4000-8000-0000000000b1", workspaceId: "28100000-0000-4000-8000-000000000010", sequence: 7, type: "booking.made", schemaVersion: 1,
  subject: { kind: "booking", id: "b1" }, area: "bookings", occurredAt: "2026-10-15T10:00:00+00:00", recordedAt: "2026-10-15T10:00:01+00:00", data: { bookingId: "b1" },
};
const SECRET = "whsec_fixture_secret_value";

describe("signing", () => {
  it("round-trips, and rejects a tampered body, a wrong secret and a stale timestamp", () => {
    const body = webhookBody(EVENT);
    const header = signAppEventWebhook(SECRET, 1_000, body);
    expect(header).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
    expect(verifyAppEventSignature(SECRET, header, body, 1_000)).toBe(true);
    expect(verifyAppEventSignature(SECRET, header, body, 1_299)).toBe(true);
    expect(verifyAppEventSignature(SECRET, header, body + " ", 1_000)).toBe(false);
    expect(verifyAppEventSignature("whsec_other", header, body, 1_000)).toBe(false);
    expect(verifyAppEventSignature(SECRET, header, body, 1_301)).toBe(false);
    expect(verifyAppEventSignature(SECRET, "t=1000", body, 1_000)).toBe(false);
    expect(verifyAppEventSignature(SECRET, "t=1000,v1=zz", body, 1_000)).toBe(false);
    expect(verifyAppEventSignature(SECRET, "garbage", body, 1_000)).toBe(false);
  });

  it("makes a secret that ends in its hint", () => {
    const { secret, hint } = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(hint).toBe(secret.slice(-4));
    expect(hint).toMatch(/^[A-Za-z0-9_-]{4}$/);
    expect(newWebhookSecret().secret).not.toBe(secret);
  });

  it("sends exactly the thin envelope", () => {
    expect(Object.keys(JSON.parse(webhookBody(EVENT)))).toEqual(["id", "type", "schemaVersion", "businessId", "sequence", "occurredAt", "data"]);
    expect(JSON.parse(webhookBody(EVENT)).businessId).toBe(EVENT.workspaceId);
  });
});

describe("validateWebhookUrl", () => {
  const ok = vi.fn(async () => ({ address: "93.184.216.34" }));
  it("accepts a public https address and normalizes it", async () => {
    await expect(validateWebhookUrl("  https://maker.example.test/events  ", ok)).resolves.toBe("https://maker.example.test/events");
    await expect(validateWebhookUrl("https://maker.example.test:443/x", ok)).resolves.toBe("https://maker.example.test/x");
  });
  it("refuses http, credentials, other ports, private hosts and long addresses", async () => {
    const refusing = vi.fn(async () => { throw new Error("Blocked: resolved to private IP 10.0.0.1"); });
    for (const bad of ["http://maker.example.test/e", "https://user:pass@maker.example.test/e", "https://maker.example.test:8443/e", "not a url", "", `https://maker.example.test/${"a".repeat(500)}`]) {
      await expect(validateWebhookUrl(bad, ok), bad).rejects.toBeInstanceOf(WorkspaceConflictError);
    }
    await expect(validateWebhookUrl("https://localhost/e", refusing)).rejects.toThrow("This address can't receive events. Use a public https address.");
    await expect(validateWebhookUrl("https://10.0.0.1/e", refusing)).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
});

describe("sendAppEventWebhook", () => {
  const target: WebhookTarget = { id: "e1", workspaceId: EVENT.workspaceId, url: "https://maker.example.test/events", eventTypes: ["booking.made"], secretCiphertext: "enc:v1:sealed" };
  const decrypt = () => SECRET;
  const run = (post: typeof postPinned) => sendAppEventWebhook(target, EVENT, 3, { post, decrypt, now: () => 1_700_000_000_000 });
  const returning = (status: number) => (async () => ({ status })) as unknown as typeof postPinned;
  const throwing = (message: string) => (async () => { throw new Error(message); }) as unknown as typeof postPinned;

  it("maps the outcome table", async () => {
    const table: [number, string][] = [[200, "delivered"], [204, "delivered"], [410, "gone"], [301, "permanent"], [302, "permanent"], [307, "permanent"],
      [408, "retry"], [429, "retry"], [500, "retry"], [503, "retry"], [400, "permanent"], [401, "permanent"], [404, "permanent"], [422, "permanent"]];
    for (const [status, outcome] of table) await expect(run(returning(status)), String(status)).resolves.toBe(outcome);
    await expect(run(throwing("address not allowed"))).resolves.toBe("permanent");
    await expect(run(throwing("timed out"))).resolves.toBe("retry");
    await expect(run(throwing("ECONNRESET"))).resolves.toBe("retry");
  });

  it("signs the body, names the event and never sends the secret", async () => {
    const post = vi.fn(async () => ({ status: 200 })) as unknown as typeof postPinned;
    await run(post);
    const [url, body, headers, options] = (post as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, Record<string, string>, { timeoutMs: number }];
    expect(url).toBe(target.url);
    expect(options.timeoutMs).toBe(5000);
    expect(headers).toMatchObject({
      "Content-Type": "application/json", "User-Agent": "Strelva-Events/1", "Strelva-Event-Id": EVENT.id, "Strelva-Event-Type": "booking.made", "Strelva-Delivery-Attempt": "3",
    });
    expect(verifyAppEventSignature(SECRET, headers["Strelva-Signature"]!, body, 1_700_000_000)).toBe(true);
    expect(JSON.stringify(headers)).not.toContain(SECRET);
    expect(body).not.toContain(SECRET);
  });

  it("does not log the secret, the body or the full address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await run(throwing(`failed for ${SECRET} at ${target.url}`));
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("maker.example.test");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("/events");
    warn.mockRestore();
  });

  describe("with a sealed secret", () => {
    beforeEach(() => vi.stubEnv("SECRETS_ENC_KEY", "app-events-test-key"));
    afterEach(() => vi.unstubAllEnvs());
    it("opens it with the platform key", async () => {
      const sealed = encryptSecret(SECRET);
      expect(sealed.startsWith("enc:v1:")).toBe(true);
      expect(decryptSecret(sealed)).toBe(SECRET);
      const post = vi.fn(async () => ({ status: 200 })) as unknown as typeof postPinned;
      await expect(sendAppEventWebhook({ ...target, secretCiphertext: sealed }, EVENT, 1, { post })).resolves.toBe("delivered");
    });
  });
});

describe("postPinned", () => {
  const validate = async () => ({ address: "93.184.216.34" });
  function fakeRequest(options: { status?: number; body?: Buffer; hang?: boolean } = {}) {
    const seen: { options: Record<string, unknown>; body: string }[] = [];
    const responses: PassThrough[] = [];
    const destroyed = vi.fn();
    const request = ((requestOptions: Record<string, unknown>, callback: (res: PassThrough) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: () => void };
      req.destroy = () => destroyed();
      req.end = (body: string) => {
        seen.push({ options: requestOptions, body });
        if (options.hang) return;
        queueMicrotask(() => {
          const res = new PassThrough() as PassThrough & { statusCode: number };
          res.statusCode = options.status ?? 200;
          responses.push(res);
          callback(res);
          if (options.body) res.write(options.body);
          res.end();
        });
      };
      return req;
    }) as unknown as typeof import("node:https").request;
    return { request, seen, responses, destroyed };
  }

  it("posts to the pinned address with a length, no compression and the signature", async () => {
    const fake = fakeRequest({ status: 202 });
    const result = await postPinned("https://maker.example.test/events?x=1", '{"a":1}', { "Strelva-Signature": "t=1,v1=ab" }, { timeoutMs: 1000, validate, request: fake.request });
    expect(result).toEqual({ status: 202 });
    const { options, body } = fake.seen[0]!;
    expect(body).toBe('{"a":1}');
    expect(options).toMatchObject({ method: "POST", hostname: "maker.example.test", port: 443, path: "/events?x=1", protocol: "https:", family: 4 });
    expect(options.headers).toMatchObject({ "Content-Length": "7", "Accept-Encoding": "identity", "Strelva-Signature": "t=1,v1=ab" });
    expect(typeof options.lookup).toBe("function");
  });

  it("returns a redirect without following it", async () => {
    const fake = fakeRequest({ status: 302 });
    await expect(postPinned("https://maker.example.test/e", "{}", {}, { timeoutMs: 1000, validate, request: fake.request })).resolves.toEqual({ status: 302 });
    expect(fake.seen).toHaveLength(1);
  });

  it("reads at most 2048 bytes of the answer", async () => {
    const fake = fakeRequest({ status: 500, body: Buffer.alloc(100_000, 97) });
    await expect(postPinned("https://maker.example.test/e", "{}", {}, { timeoutMs: 1000, validate, request: fake.request })).resolves.toEqual({ status: 500 });
    expect(fake.responses[0]!.destroyed).toBe(true);
    expect(fake.destroyed).toHaveBeenCalled();
  });

  it("times out", async () => {
    const fake = fakeRequest({ hang: true });
    await expect(postPinned("https://maker.example.test/e", "{}", {}, { timeoutMs: 20, validate, request: fake.request })).rejects.toThrow("timed out");
    expect(fake.destroyed).toHaveBeenCalled();
  });

  it("refuses unsafe addresses before any request", async () => {
    const fake = fakeRequest();
    const refusing = async () => { throw new Error("Blocked: resolved to private IP 10.0.0.1"); };
    for (const bad of ["http://maker.example.test/e", "https://u:p@maker.example.test/e", "https://maker.example.test:8443/e", "nope"]) {
      await expect(postPinned(bad, "{}", {}, { timeoutMs: 1000, validate, request: fake.request }), bad).rejects.toThrow("address not allowed");
    }
    await expect(postPinned("https://internal.example.test/e", "{}", {}, { timeoutMs: 1000, validate: refusing, request: fake.request })).rejects.toThrow("address not allowed");
    expect(fake.seen).toHaveLength(0);
  });
});
