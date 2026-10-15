import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appEventHandlerFor,
  PermanentAppEventError,
  registerAppEventHandler,
  resetAppEventHandlers,
} from "@/platform/app-events/handlers";
import { activeSubscribersFor, declaredSubscribers } from "@/platform/app-events/subscriptions";
import { resolveBuiltInAppRelease } from "@/platform/app-releases/resolve";
import { BUILT_IN_APPS, assertBuiltInAppCatalog } from "@/platform/app-releases/catalog";
import type { BuiltInApp, BuiltInAppRelease } from "@/platform/app-releases/contracts";
import { registerProductAppEventHandlers } from "@/server/app-events/handlers";

const WS = "28100000-0000-4000-8000-000000000010";

const release = (number: number, patch: Partial<BuiltInAppRelease> = {}): BuiltInAppRelease => ({
  key: `bookings.r${number}`, number, summary: "A thing.", shippedIn: null, changesLiveBehavior: false, gates: [], requiredConnections: [], ...patch,
});
const twoReleases: BuiltInApp = {
  id: "bookings", name: "Bookings", publisher: "platform", systemKinds: [], labelOnSystems: true, makeRealChannels: [], availability: [],
  releases: [
    release(1, { eventSubscriptions: [{ event: "booking.made", handler: "a", scope: "bookings" }] }),
    release(2, {
      changesLiveBehavior: true,
      gates: [{ kind: "workspace_flag", flag: "catalog_reports" }],
      eventSubscriptions: [
        { event: "booking.made", handler: "a", scope: "bookings" },
        { event: "booking.changed", handler: "a", scope: "bookings", maxAttempts: 3 },
        { event: "inquiry.received", handler: "b", scope: "inquiries" },
      ],
    }),
  ],
};
const quiet: BuiltInApp = { ...twoReleases, id: "inquiries", name: "Inquiries", releases: [release(1, { key: "inquiries.r1" })] };

const resolveWith = (releaseTwoOn: boolean) =>
  vi.fn((app: BuiltInApp) => resolveBuiltInAppRelease(app, () => releaseTwoOn));

afterEach(() => resetAppEventHandlers());

describe("declared and active subscriptions", () => {
  it("passes the live catalog and declares nothing for the six 1.0 Apps", () => {
    expect(() => assertBuiltInAppCatalog(BUILT_IN_APPS)).not.toThrow();
    expect(declaredSubscribers(BUILT_IN_APPS.filter((app) => ["bookings", "inquiries", "recaps", "documents", "ask", "internal_tools"].includes(app.id)).map((app) => ({
      ...app, releases: [app.releases[0]!],
    })))).toEqual([]);
  });

  it("unions events across Releases per handler", () => {
    expect(declaredSubscribers([twoReleases])).toEqual([
      { subscriber: "app:bookings:a", appId: "bookings", handler: "a", events: ["booking.made", "booking.changed"], maxAttempts: 8 },
      { subscriber: "app:bookings:b", appId: "bookings", handler: "b", events: ["inquiry.received"], maxAttempts: 8 },
    ]);
  });

  it("is empty while the app_events flag is off, without resolving any App", async () => {
    const resolve = resolveWith(true);
    const map = await activeSubscribersFor(WS, { apps: [twoReleases], flagOn: async () => false, resolve });
    expect(map.size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("follows the Release the business has reached", async () => {
    const off = await activeSubscribersFor(WS, { apps: [twoReleases], flagOn: async () => true, resolve: resolveWith(false) });
    expect([...off.entries()]).toEqual([["app:bookings:a", { appId: "bookings", handler: "a", events: ["booking.made"], maxAttempts: 8 }]]);
    const on = await activeSubscribersFor(WS, { apps: [twoReleases], flagOn: async () => true, resolve: resolveWith(true) });
    expect(on.get("app:bookings:a")).toEqual({ appId: "bookings", handler: "a", events: ["booking.made", "booking.changed"], maxAttempts: 8 });
    expect(on.get("app:bookings:b")).toEqual({ appId: "bookings", handler: "b", events: ["inquiry.received"], maxAttempts: 8 });
  });

  it("gives nothing for an App that is not available", async () => {
    const resolve = vi.fn(async (app: BuiltInApp) => ({ appId: app.id, available: false as const }));
    const map = await activeSubscribersFor(WS, { apps: [twoReleases], flagOn: async () => true, resolve });
    expect(map.size).toBe(0);
  });

  it("does not resolve an App that declares nothing", async () => {
    const resolve = resolveWith(true);
    await activeSubscribersFor(WS, { apps: [quiet, twoReleases], flagOn: async () => true, resolve });
    expect(resolve.mock.calls.map(([app]) => app.id)).toEqual(["bookings"]);
    const none = vi.fn();
    await expect(activeSubscribersFor(WS, { apps: [quiet], flagOn: none, resolve: none })).resolves.toEqual(new Map());
    expect(none).not.toHaveBeenCalled();
  });

  it("uses the largest declared attempt limit", async () => {
    const app: BuiltInApp = { ...twoReleases, releases: [release(1, { eventSubscriptions: [
      { event: "booking.made", handler: "a", scope: "bookings", maxAttempts: 3 },
      { event: "booking.changed", handler: "a", scope: "bookings", maxAttempts: 5 },
    ] })] };
    const map = await activeSubscribersFor(WS, { apps: [app], flagOn: async () => true, resolve: resolveWith(true) });
    expect(map.get("app:bookings:a")?.maxAttempts).toBe(5);
  });
});

describe("handler registry", () => {
  const run = async () => undefined;
  it("registers once, is idempotent for the same function and refuses a different one", () => {
    const cleanup = registerAppEventHandler("bookings", "a", run);
    expect(appEventHandlerFor("bookings", "a")).toBe(run);
    expect(() => registerAppEventHandler("bookings", "a", run)).not.toThrow();
    expect(() => registerAppEventHandler("bookings", "a", async () => undefined)).toThrow("Handler bookings:a is already registered");
    cleanup();
    expect(appEventHandlerFor("bookings", "a")).toBeNull();
  });

  it("marks a permanent failure", () => {
    expect(new PermanentAppEventError("never")).toBeInstanceOf(Error);
    expect(new PermanentAppEventError("never").name).toBe("PermanentAppEventError");
  });

  it("registers a handler for every subscription the live catalog declares", () => {
    registerProductAppEventHandlers();
    registerProductAppEventHandlers();
    for (const declared of declaredSubscribers()) {
      expect(appEventHandlerFor(declared.appId, declared.handler), declared.subscriber).toBeTypeOf("function");
    }
  });
});
