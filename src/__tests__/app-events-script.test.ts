import { describe, expect, it } from "vitest";
import { captureStop, parseArgs } from "../../scripts/app-events";

const WS = "28100000-0000-4000-8000-000000000010";
const OP = ["--operator-email", "op@example.test"];

describe("pnpm app-events arguments", () => {
  it("parses status", () => {
    expect(parseArgs(["status"])).toEqual({ command: "status" });
    expect(() => parseArgs(["status", "extra"])).toThrow();
  });

  it("parses capture on and off with the operator and a reason", () => {
    expect(parseArgs(["capture", "on", ...OP, "--reason", "Local check", "--yes"])).toEqual({
      command: "capture", capture: true, operatorEmail: "op@example.test", reason: "Local check", yes: true, productionApproved: false,
    });
    expect(parseArgs(["capture", "off", "--operator-email=op@example.test", "--reason=Stop it", "--production-approved"])).toMatchObject({
      capture: false, yes: false, productionApproved: true,
    });
  });

  it("refuses a capture command without its parts", () => {
    expect(() => parseArgs(["capture", ...OP, "--reason", "Local check"])).toThrow(/on or off/);
    expect(() => parseArgs(["capture", "on", "--reason", "Local check"])).toThrow(/operator-email/);
    expect(() => parseArgs(["capture", "on", ...OP])).toThrow(/reason/);
    expect(() => parseArgs(["capture", "on", ...OP, "--reason", "x"])).toThrow(/reason/);
    expect(() => parseArgs(["capture", "on", ...OP, "--reason", "Local check", "--force"])).toThrow(/Unknown flag/);
    expect(() => parseArgs(["capture", "on", "--operator-email"])).toThrow(/needs a value/);
  });

  it("parses lanes", () => {
    expect(parseArgs(["lanes", "--workspace", WS.toUpperCase(), ...OP])).toEqual({ command: "lanes", workspaceId: WS, operatorEmail: "op@example.test" });
    expect(() => parseArgs(["lanes", "--workspace", "nope", ...OP])).toThrow(/workspace/);
    expect(() => parseArgs(["lanes", "--workspace", WS])).toThrow(/operator-email/);
  });

  it("prints usage for anything else", () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(["delete"])).toThrow(/Usage/);
  });
});

describe("the capture switch is a stop unless it is local and confirmed", () => {
  const command = (patch: { yes?: boolean; productionApproved?: boolean }) => ({ ...(parseArgs(["capture", "on", ...OP, "--reason", "Local check"]) as Extract<ReturnType<typeof parseArgs>, { command: "capture" }>), yes: false, productionApproved: false, ...patch });
  it("stops without --yes or --production-approved", () => {
    expect(captureStop(command({}), "http://127.0.0.1:54321")).toMatch(/^STOP: .*--yes/);
    expect(captureStop(command({}), undefined)).toMatch(/^STOP/);
  });
  it("lets --yes through only for a loopback database", () => {
    expect(captureStop(command({ yes: true }), "http://127.0.0.1:54321")).toBeNull();
    expect(captureStop(command({ yes: true }), "http://localhost:54321")).toBeNull();
    expect(captureStop(command({ yes: true }), "https://abc.supabase.co")).toMatch(/^STOP: .*not a local loopback host/);
    expect(captureStop(command({ yes: true }), undefined)).toMatch(/^STOP/);
  });
  it("lets only the production approval through anywhere else", () => {
    expect(captureStop(command({ productionApproved: true }), "https://abc.supabase.co")).toBeNull();
  });
});
