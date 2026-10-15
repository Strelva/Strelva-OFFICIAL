import { afterEach, describe, expect, it, vi } from "vitest";
import { clearReleaseFlagCache, setReleaseFlagsDb } from "@/platform/release-flags/store";
import { intakeSensitiveFieldsAvailable, verticalIntakePublicFor, verticalIntakeReleaseMayBeOn } from "@/products/vertical-intake/release";

const WS = "7f000000-0000-4000-8000-000000000010";

function fakeFlags(state: "off" | "operators" | "on") {
  const rpc = vi.fn(async () => ({
    data: { workspaceId: WS, flags: { vertical_intake: { state, revision: 1, changedAt: "2026-10-06T00:00:00Z" } }, testers: [], testerEmails: [] },
    error: null,
  }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

afterEach(() => {
  setReleaseFlagsDb(null);
  clearReleaseFlagCache();
  vi.unstubAllEnvs();
});

describe("verticalIntakeReleaseMayBeOn", () => {
  it("needs the workspace release and the vertical_intake flag env", () => {
    expect(verticalIntakeReleaseMayBeOn({})).toBe(false);
    expect(verticalIntakeReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1" })).toBe(false);
    expect(verticalIntakeReleaseMayBeOn({ STRELVA_VERTICAL_INTAKE_RELEASE: "workspace" })).toBe(false);
    expect(verticalIntakeReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_VERTICAL_INTAKE_RELEASE: "0" })).toBe(false);
    expect(verticalIntakeReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_VERTICAL_INTAKE_RELEASE: "workspace" })).toBe(true);
    expect(verticalIntakeReleaseMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_VERTICAL_INTAKE_RELEASE: "1" })).toBe(true);
  });
});

describe("intakeSensitiveFieldsAvailable", () => {
  it("needs both the switch and an encryption key", () => {
    expect(intakeSensitiveFieldsAvailable({})).toBe(false);
    expect(intakeSensitiveFieldsAvailable({ STRELVA_INTAKE_SENSITIVE_FIELDS: "1" })).toBe(false);
    expect(intakeSensitiveFieldsAvailable({ SECRETS_ENC_KEY: "k" })).toBe(false);
    expect(intakeSensitiveFieldsAvailable({ STRELVA_INTAKE_SENSITIVE_FIELDS: "true", SECRETS_ENC_KEY: "k" })).toBe(false);
    expect(intakeSensitiveFieldsAvailable({ STRELVA_INTAKE_SENSITIVE_FIELDS: "1", SECRETS_ENC_KEY: "k" })).toBe(true);
  });
});

describe("verticalIntakePublicFor", () => {
  it("is closed when the env is off and does not read a row", async () => {
    const rpc = fakeFlags("on");
    expect(await verticalIntakePublicFor(WS)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads the business's row with the operator viewer under workspace mode", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_VERTICAL_INTAKE_RELEASE", "workspace");
    fakeFlags("operators");
    expect(await verticalIntakePublicFor(WS)).toBe(true);
    clearReleaseFlagCache();
    fakeFlags("off");
    expect(await verticalIntakePublicFor(WS)).toBe(false);
  });
});
