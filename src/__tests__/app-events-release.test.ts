import { afterEach, describe, expect, it, vi } from "vitest";
import { appEventsMayBeOn, appEventsReleased, appEventsReleasedOrThrow, appEventWebhooksEnabled } from "@/platform/app-events/release";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { RELEASE_FLAG_ENV, RELEASE_FLAG_LABELS } from "@/platform/release-flags/resolve";

const WS = "28100000-0000-4000-8000-000000000010";

function rows(state: "on" | "off") {
  return { workspaceId: WS, flags: { app_events: { state, revision: 1, changedAt: "2026-10-15T00:00:00Z" } }, testers: [], testerEmails: [] };
}
function fakeDb(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

afterEach(() => setReleaseFlagsDb(null));

describe("app_events release", () => {
  it("names its env switch and label", () => {
    expect(RELEASE_FLAG_ENV.app_events).toBe("STRELVA_APP_EVENTS_RELEASE");
    expect(RELEASE_FLAG_LABELS.app_events).toBe("Events Apps receive");
  });

  it("is off everywhere without the workspace release, or with the env unset", () => {
    expect(appEventsMayBeOn({})).toBe(false);
    expect(appEventsMayBeOn({ STRELVA_APP_EVENTS_RELEASE: "1" })).toBe(false);
    expect(appEventsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1" })).toBe(false);
    expect(appEventsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "0" })).toBe(false);
    expect(appEventsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "true" })).toBe(false);
  });

  it("may be on under workspace or 1 mode", () => {
    expect(appEventsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "workspace" })).toBe(true);
    expect(appEventsMayBeOn({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "1" })).toBe(true);
  });

  it("gates Webhooks on their own switch on top of app_events", () => {
    const on = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "workspace" };
    expect(appEventWebhooksEnabled({ ...on })).toBe(false);
    expect(appEventWebhooksEnabled({ ...on, STRELVA_APP_EVENT_WEBHOOKS_RELEASE: "0" })).toBe(false);
    expect(appEventWebhooksEnabled({ ...on, STRELVA_APP_EVENT_WEBHOOKS_RELEASE: "workspace" })).toBe(false);
    expect(appEventWebhooksEnabled({ ...on, STRELVA_APP_EVENT_WEBHOOKS_RELEASE: "1" })).toBe(true);
    expect(appEventWebhooksEnabled({ ...on, STRELVA_APP_EVENT_WEBHOOKS_RELEASE: " 1 " })).toBe(true);
    expect(appEventWebhooksEnabled({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENT_WEBHOOKS_RELEASE: "1" })).toBe(false);
    expect(appEventWebhooksEnabled({ STRELVA_APP_EVENTS_RELEASE: "1", STRELVA_APP_EVENT_WEBHOOKS_RELEASE: "1" })).toBe(false);
  });

  it("reads no row while the env is off", async () => {
    const rpc = fakeDb(rows("on"));
    await expect(appEventsReleased(WS, undefined, {})).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("follows the business's row under workspace mode", async () => {
    const env = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "workspace" };
    fakeDb(rows("on"));
    await expect(appEventsReleased(WS, undefined, env)).resolves.toBe(true);
    setReleaseFlagsDb(null);
    fakeDb(rows("off"));
    await expect(appEventsReleased(WS, undefined, env)).resolves.toBe(false);
  });

  it("is on except rows set off under mode 1", async () => {
    const env = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "1" };
    fakeDb({ workspaceId: WS, flags: {}, testers: [], testerEmails: [] });
    await expect(appEventsReleased(WS, undefined, env)).resolves.toBe(true);
  });

  it("fails closed when the row read fails under workspace mode", async () => {
    const env = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "workspace" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fakeDb(null, { message: "down" });
    await expect(appEventsReleased(WS, undefined, env)).resolves.toBe(false);
    spy.mockRestore();
  });

  it("the strict reader throws on a failed read where the lenient one reads off", async () => {
    const env = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_APP_EVENTS_RELEASE: "workspace" };
    fakeDb(null, { message: "down" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(appEventsReleased(WS, undefined, env)).resolves.toBe(false);
    await expect(appEventsReleasedOrThrow(WS, env)).rejects.toThrow();
    fakeDb(rows("on"));
    await expect(appEventsReleasedOrThrow(WS, env)).resolves.toBe(true);
    await expect(appEventsReleasedOrThrow(WS, {})).resolves.toBe(false);
  });
});
