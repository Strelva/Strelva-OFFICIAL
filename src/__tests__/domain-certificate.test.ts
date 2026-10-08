import { EventEmitter } from "node:events";
import type { connect } from "node:tls";
import { describe, expect, it, vi } from "vitest";
import { checkCertificateExpiry } from "@/lib/domain-certificate";
import { summarizeDomainAlerts } from "@/lib/domain-monitor";

function transport(event: "secureConnect" | "error" | "close", validTo = "2026-10-15T00:00:00Z", authorized = true) {
  const socket = Object.assign(new EventEmitter(), { authorized, getPeerCertificate: () => ({ valid_to: validTo }), destroy: vi.fn() });
  const connectMock = vi.fn(() => { queueMicrotask(() => socket.emit(event, ...(event === "error" ? [new Error("TLS refused")] : []))); return socket; });
  return { socket, connectMock, connect: connectMock as unknown as typeof connect };
}
const validate = vi.fn(async () => ({ address: "93.184.216.34" }));
describe("read-only public certificate expiry", () => {
  it("pins the validated address and verifies the hostname before recording expiry", async () => {
    const mock = transport("secureConnect");
    expect(await checkCertificateExpiry("fixture.example.test", { validate, connect: mock.connect, now: () => Date.parse("2026-10-08T00:00:00Z") }))
      .toEqual({ sslExpiresAt: "2026-10-15T00:00:00.000Z", sslDaysToExpiry: 7 });
    expect(mock.connectMock).toHaveBeenCalledWith({ host: "93.184.216.34", port: 443, servername: "fixture.example.test", rejectUnauthorized: true });
    expect(mock.socket.destroy).toHaveBeenCalledOnce();
  });
  it("keeps rejected, malformed and abruptly closed certificates unknown", async () => {
    for (const mock of [transport("error"), transport("close"), transport("secureConnect", "invalid"), transport("secureConnect", "2026-10-15", false)]) {
      expect(await checkCertificateExpiry("fixture.example.test", { validate, connect: mock.connect })).toEqual({ sslExpiresAt: null, sslDaysToExpiry: null });
    }
  });
  it("distinguishes a still-valid one-hour certificate from one expired an hour ago", async () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    for (const [validTo, expected] of [["2026-10-08T13:00:00Z", 1], ["2026-10-08T11:00:00Z", -1]] as const) {
      expect((await checkCertificateExpiry("fixture.example.test", { validate, connect: transport("secureConnect", validTo).connect, now: () => now })).sslDaysToExpiry).toBe(expected);
    }
  });
  it("makes no socket connection when safety validation refuses or a hostname contains URL syntax", async () => {
    const mock = transport("secureConnect");
    await checkCertificateExpiry("fixture.example.test", { validate: async () => { throw Error("private address"); }, connect: mock.connect });
    await checkCertificateExpiry("fixture.example.test/path", { validate, connect: mock.connect });
    expect(mock.connectMock).not.toHaveBeenCalled();
  });
  it("times out and closes a stalled TLS handshake", async () => {
    vi.useFakeTimers();
    try {
      const socket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      const pending = checkCertificateExpiry("fixture.example.test", { validate, connect: (() => socket) as unknown as typeof connect });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await pending).toEqual({ sslExpiresAt: null, sslDaysToExpiry: null });
      expect(socket.destroy).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("bounds DNS, clears the deadline and never connects after a late lookup", async () => {
    vi.useFakeTimers();
    try {
      let finishDns!: (value: { address: string }) => void;
      const dns = new Promise<{ address: string }>(resolve => { finishDns = resolve; });
      const mock = transport("secureConnect");
      const pending = checkCertificateExpiry("fixture.example.test", { validate: () => dns, connect: mock.connect });
      await vi.advanceTimersByTimeAsync(8_000);
      expect(await pending).toEqual({ sslExpiresAt: null, sslDaysToExpiry: null });
      finishDns({ address: "93.184.216.34" });
      await vi.advanceTimersByTimeAsync(1);
      expect(mock.connectMock).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("adds an independent SSL-expiry bucket even when registry expiry is far away", () => {
    const result = summarizeDomainAlerts([{ tenantId: "fixture", siteName: "Fixture", ownerName: "Owner", primaryHost: "fixture.example.test", worst: "up", nearestExpiryDays: 300,
      checks: [{ host: "fixture.example.test", kind: "custom", state: "up", url: "https://fixture.example.test", bytes: 900, httpStatus: 200, latencyMs: 1,
        checkedAt: "2026-10-08", expiresAt: "2027-10-01", daysToExpiry: 300, sslExpiresAt: "2026-10-15", sslDaysToExpiry: 7 }] }]);
    expect(result.signature).toBe("S:fixture.example.test:7"); expect(result.expiring[0]?.problem).toContain("SSL certificate expires in 7d");
  });
});
