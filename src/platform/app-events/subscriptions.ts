import { BUILT_IN_APPS, builtInAppRelease } from "@/platform/app-releases/catalog";
import type { BuiltInApp, BuiltInAppId, BuiltInAppReleaseState } from "@/platform/app-releases/contracts";
import { resolveBuiltInAppRelease } from "@/platform/app-releases/resolve";
import { gateReaderFor } from "@/platform/app-releases/server";
import { APP_EVENT_MAX_ATTEMPTS, appSubscriberKey, type AppEventType } from "./contracts";
import { appEventsReleased } from "./release";

export interface DeclaredSubscriber {
  subscriber: string;
  appId: BuiltInAppId;
  handler: string;
  events: AppEventType[];
  maxAttempts: number;
}

/** Every (App, handler) any Release declares, across all Releases. Whether it is active for a business is activeSubscribersFor. */
export function declaredSubscribers(apps: readonly BuiltInApp[] = BUILT_IN_APPS): DeclaredSubscriber[] {
  const found = new Map<string, DeclaredSubscriber>();
  for (const app of apps) {
    for (const release of app.releases) {
      for (const subscription of release.eventSubscriptions ?? []) {
        const subscriber = appSubscriberKey(app.id, subscription.handler);
        const entry = found.get(subscriber) ?? { subscriber, appId: app.id, handler: subscription.handler, events: [], maxAttempts: 0 };
        if (!entry.events.includes(subscription.event)) entry.events.push(subscription.event);
        entry.maxAttempts = Math.max(entry.maxAttempts, subscription.maxAttempts ?? APP_EVENT_MAX_ATTEMPTS);
        found.set(subscriber, entry);
      }
    }
  }
  return [...found.values()];
}

export interface SubscriptionDeps {
  apps?: readonly BuiltInApp[];
  flagOn?: (workspaceId: string) => Promise<boolean>;
  resolve?: (app: BuiltInApp, workspaceId: string) => Promise<BuiltInAppReleaseState>;
}

export interface ActiveSubscriber { appId: BuiltInAppId; handler: string; events: AppEventType[]; maxAttempts: number }

/**
 * The subscriptions in force for one business: the Release it has reached, with the
 * app_events flag on. Release lists are full lists, so the reached Release alone decides.
 * An App that declares nothing on any Release is never resolved, so it costs no flag read.
 */
export async function activeSubscribersFor(workspaceId: string, deps: SubscriptionDeps = {}): Promise<Map<string, ActiveSubscriber>> {
  const apps = deps.apps ?? BUILT_IN_APPS;
  const active = new Map<string, ActiveSubscriber>();
  const subscribing = apps.filter((app) => app.releases.some((release) => (release.eventSubscriptions?.length ?? 0) > 0));
  if (!subscribing.length) return active;
  const flagOn = deps.flagOn ?? ((id: string) => appEventsReleased(id));
  if (!(await flagOn(workspaceId))) return active;
  const resolve = deps.resolve ?? ((app: BuiltInApp, id: string) => resolveBuiltInAppRelease(app, gateReaderFor(id)));
  for (const app of subscribing) {
    const state = await resolve(app, workspaceId);
    if (!state.available) continue;
    const release = builtInAppRelease(app, state.key);
    for (const subscription of release.eventSubscriptions ?? []) {
      const subscriber = appSubscriberKey(app.id, subscription.handler);
      const entry = active.get(subscriber) ?? { appId: app.id, handler: subscription.handler, events: [], maxAttempts: 0 };
      if (!entry.events.includes(subscription.event)) entry.events.push(subscription.event);
      entry.maxAttempts = Math.max(entry.maxAttempts, subscription.maxAttempts ?? APP_EVENT_MAX_ATTEMPTS);
      active.set(subscriber, entry);
    }
  }
  return active;
}
