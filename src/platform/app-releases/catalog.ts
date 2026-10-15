import type { MakeRealChannel } from "@/platform/possibilities/contracts";
import { requiredConnectionSchema, type RequiredConnection } from "@/platform/connections/contracts";
import type { ReleaseFlag } from "@/platform/release-flags/resolve";
import { APP_EVENT_SCOPE, appEventSubscriptionSchema } from "@/platform/app-events/contracts";
import {
  appReleaseGateSchema,
  BUILT_IN_APP_IDS,
  type BuiltInApp,
  type BuiltInAppRelease,
  type RollbackPlan,
} from "./contracts";

/**
 * The Apps the platform ships in code to every business. Release 1 of each is
 * the 1.0.0 production baseline with no gates, so nothing here changes live
 * behavior. To add a Release, append one entry (README.md, "Adding a Release").
 */
const resend = (optional: boolean, purpose: string): RequiredConnection => ({ provider: "resend", access: "act", optional, purpose });

const release1 = (appId: string, summary: string, requiredConnections: readonly RequiredConnection[]): BuiltInAppRelease =>
  Object.freeze({ key: `${appId}.baseline`, number: 1, summary, shippedIn: "1.0.0", changesLiveBehavior: false, gates: [], requiredConnections });

export const BUILT_IN_APPS: readonly BuiltInApp[] = Object.freeze([
  Object.freeze({
    id: "bookings",
    name: "Bookings",
    publisher: "platform",
    systemKinds: ["booking"],
    labelOnSystems: true,
    makeRealChannels: ["booking_page"],
    availability: [],
    releases: [
      release1("bookings", "Customers book or ask for a time on the business's booking page.", [
        { provider: "google_calendar", access: "read", optional: true, purpose: "Read busy times so customers only see open times" },
        resend(true, "Send booking confirmations and reminders to customers"),
      ]),
    ],
  } satisfies BuiltInApp),
  Object.freeze({
    id: "inquiries",
    name: "Inquiries",
    publisher: "platform",
    systemKinds: ["inquiry"],
    labelOnSystems: true,
    makeRealChannels: ["inquiry_form"],
    availability: [{ kind: "workspace_flag", flag: "inquiries" }],
    releases: [
      release1("inquiries", "Customer inquiries from the website arrive in one place to read and decide on.", [
        resend(false, "Send System email to approved recipients"),
      ]),
    ],
  } satisfies BuiltInApp),
  Object.freeze({
    id: "recaps",
    name: "Recaps",
    publisher: "platform",
    systemKinds: ["report"],
    labelOnSystems: false,
    makeRealChannels: [],
    availability: [{ kind: "env", name: "STRELVA_WORKSPACE_RELEASE", values: ["1"] }],
    releases: [
      release1("recaps", "Weekly and monthly recaps of what Strelva saw on the business's website.", [
        resend(true, "Email recaps to the owner"),
      ]),
    ],
  } satisfies BuiltInApp),
  Object.freeze({
    id: "documents",
    name: "Documents",
    publisher: "platform",
    systemKinds: ["document"],
    labelOnSystems: true,
    makeRealChannels: [],
    availability: [],
    releases: [release1("documents", "Write and keep documents the business uses.", [])],
  } satisfies BuiltInApp),
  Object.freeze({
    id: "ask",
    name: "Ask Strelva",
    publisher: "platform",
    systemKinds: [],
    labelOnSystems: false,
    makeRealChannels: [],
    availability: [
      { kind: "env", name: "STRELVA_ASK_RELEASE", values: ["1"] },
      { kind: "workspace_flag", flag: "systems" },
    ],
    releases: [release1("ask", "Ask about the business and its Systems; Strelva answers, drafts a change or files a Request.", [])],
  } satisfies BuiltInApp),
  Object.freeze({
    id: "internal_tools",
    name: "Internal tools",
    publisher: "platform",
    systemKinds: ["internal_app", "tracker"],
    labelOnSystems: false,
    makeRealChannels: ["internal_app"],
    availability: [],
    releases: [
      release1("internal_tools", "Tools the business uses for its own work, with forms and records.", [
        resend(false, "Send System email to approved recipients"),
      ]),
    ],
  } satisfies BuiltInApp),
]);

export function builtInApp(id: string): BuiltInApp {
  const app = BUILT_IN_APPS.find(item => item.id === id);
  if (!app) throw new Error(`Unknown built-in App: ${id}`);
  return app;
}

export function latestBuiltInAppRelease(app: BuiltInApp): BuiltInAppRelease {
  return app.releases[app.releases.length - 1]!;
}

export function builtInAppRelease(app: BuiltInApp, key: string): BuiltInAppRelease {
  const found = app.releases.find(item => item.key === key);
  if (!found) throw new Error(`Unknown Release key for ${app.name}: ${key}`);
  return found;
}

export function builtInAppForSystemKind(kind: string): BuiltInApp | null {
  return BUILT_IN_APPS.find(app => app.systemKinds.includes(kind)) ?? null;
}

export function builtInAppForMakeRealChannel(channel: MakeRealChannel): BuiltInApp | null {
  return BUILT_IN_APPS.find(app => app.makeRealChannels.includes(channel)) ?? null;
}

export function releaseLabel(number: number): string {
  return `Release ${number}`;
}

export function builtInAppReleaseLabel(app: Pick<BuiltInApp, "name">, number: number): string {
  return `${app.name} ${releaseLabel(number)}`;
}

/** Releases a workspace flag turns on. Availability gates are not Releases, so they are excluded. */
export function releasesGatedByFlag(flag: ReleaseFlag, apps: readonly BuiltInApp[] = BUILT_IN_APPS): Array<{ app: BuiltInApp; release: BuiltInAppRelease; returnsTo: number }> {
  return apps.flatMap(app =>
    app.releases
      .filter(release => release.gates.some(gate => gate.kind === "workspace_flag" && gate.flag === flag))
      .map(release => ({ app, release, returnsTo: release.number - 1 })),
  );
}

/** What the agency or operator sees beside a switch: what On does and what Off returns to. */
export function flagReleaseMeaning(flag: string, apps: readonly BuiltInApp[] = BUILT_IN_APPS): string | null {
  const gated = releasesGatedByFlag(flag as ReleaseFlag, apps);
  if (!gated.length) return null;
  return gated
    .map(({ app, release, returnsTo }) => `On turns on ${builtInAppReleaseLabel(app, release.number)}. Off returns ${app.name} to ${releaseLabel(returnsTo)}.`)
    .join(" ");
}

export function rollbackPlan(app: BuiltInApp, number: number): RollbackPlan {
  if (number < 2) throw new Error("Release 1 is the baseline and has no rollback.");
  const release = app.releases[number - 1];
  if (!release) throw new Error(`${app.name} has no Release ${number}.`);
  const turnOff = [...release.gates];
  return {
    from: number,
    to: number - 1,
    turnOff,
    scope: turnOff.length === 0 ? "redeploy" : turnOff.some(gate => gate.kind === "env") ? "everywhere" : "business",
  };
}

export function assertBuiltInAppCatalog(apps: readonly BuiltInApp[] = BUILT_IN_APPS): void {
  const ids = new Set<string>();
  const keys = new Set<string>();
  const kinds = new Map<string, string>();
  const channels = new Map<string, string>();
  for (const app of apps) {
    if (ids.has(app.id)) throw new Error(`Duplicate built-in App id: ${app.id}`);
    ids.add(app.id);
    if (!(BUILT_IN_APP_IDS as readonly string[]).includes(app.id)) throw new Error(`${app.name}: id ${app.id} is not in BUILT_IN_APP_IDS.`);
    if (!app.releases.length) throw new Error(`${app.name}: no Releases.`);
    for (const gate of app.availability) {
      if (!appReleaseGateSchema.safeParse(gate).success) throw new Error(`${app.name}: invalid availability gate.`);
    }
    for (const kind of app.systemKinds) {
      const other = kinds.get(kind);
      if (other) throw new Error(`${app.name} and ${other} both claim System kind ${kind}.`);
      kinds.set(kind, app.name);
    }
    for (const channel of app.makeRealChannels) {
      const other = channels.get(channel);
      if (other) throw new Error(`${app.name} and ${other} both claim Make it live channel ${channel}.`);
      channels.set(channel, app.name);
    }
    app.releases.forEach((release, index) => {
      const where = `${app.name} Release ${release.number}`;
      if (release.number !== index + 1) throw new Error(`${where}: number must be ${index + 1}.`);
      if (!release.key.startsWith(`${app.id}.`)) throw new Error(`${where}: key ${release.key} must start with ${app.id}.`);
      if (keys.has(release.key)) throw new Error(`${where}: duplicate key ${release.key}.`);
      keys.add(release.key);
      if (release.number > 1 && release.changesLiveBehavior && release.gates.length === 0) {
        throw new Error(`${where}: changes live behavior but has no gate. New behavior goes behind a release flag.`);
      }
      for (const gate of release.gates) {
        if (!appReleaseGateSchema.safeParse(gate).success) throw new Error(`${where}: invalid gate.`);
      }
      for (const connection of release.requiredConnections) {
        if (!requiredConnectionSchema.safeParse(connection).success) throw new Error(`${where}: invalid required Connection.`);
      }
      const subscribed = new Set<string>();
      for (const subscription of release.eventSubscriptions ?? []) {
        if (!appEventSubscriptionSchema.safeParse(subscription).success) throw new Error(`${where}: invalid event subscription.`);
        if (subscription.scope !== APP_EVENT_SCOPE[subscription.event]) {
          throw new Error(`${where}: ${subscription.event} needs scope ${APP_EVENT_SCOPE[subscription.event]}.`);
        }
        const pair = `${subscription.event}/${subscription.handler}`;
        if (subscribed.has(pair)) throw new Error(`${where}: duplicate event subscription ${pair}.`);
        subscribed.add(pair);
      }
    });
  }
}

assertBuiltInAppCatalog();
