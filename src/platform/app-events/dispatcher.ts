import { BUILT_IN_APPS } from "@/platform/app-releases/catalog";
import type { BuiltInApp, BuiltInAppId } from "@/platform/app-releases/contracts";
import {
  APP_EVENT_MAX_ATTEMPTS,
  backoffSeconds,
  parseSubscriberKey,
  webhookSubscriberKey,
  type AppEvent,
} from "./contracts";
import { appEventHandlerFor, PermanentAppEventError } from "./handlers";
import { resolveBuiltInAppRelease } from "@/platform/app-releases/resolve";
import { appEventsReleasedOrThrow, appEventWebhooksEnabled, strictGateReader } from "./release";
import * as defaultStore from "./store";
import type { ClaimedLane, LaneRef, WebhookEndpointTarget } from "./store";
import { activeSubscribersFor, declaredSubscribers } from "./subscriptions";
import { sendAppEventWebhook, type WebhookOutcome, type WebhookTarget } from "./webhooks";

export interface DispatchResult {
  status: "ran";
  lanes: number;
  delivered: number;
  retried: number;
  dead: number;
  skipped: number;
  unregistered: number;
  leaseLost: number;
  webhooks: { delivered: number; retried: number; dead: number; skipped: number; disabled: number };
  replays: { delivered: number; failed: number };
  purged: { events: number; deadLetters: number; failures: number } | null;
  errors: string[];
}

export interface DispatchDeps {
  store: typeof defaultStore;
  apps: readonly BuiltInApp[];
  handlerFor: typeof appEventHandlerFor;
  activeFor: (workspaceId: string) => ReturnType<typeof activeSubscribersFor>;
  workspaceOn: (workspaceId: string) => Promise<boolean>;
  webhooksOn: boolean;
  sendWebhook: (endpoint: WebhookTarget, event: AppEvent, attempt: number) => Promise<WebhookOutcome>;
  now: () => number;
  deadlineMs: number;
  laneLimit: number;
  batch: number;
  leaseSeconds: number;
  handlerTimeoutMs: number;
}

export function defaultDispatchDeps(): DispatchDeps {
  return {
    store: defaultStore,
    apps: BUILT_IN_APPS,
    handlerFor: appEventHandlerFor,
    // Strict reads: a failed flag or gate read throws, so the dispatcher releases the lane instead of skipping it past its events.
    activeFor: (workspaceId) => activeSubscribersFor(workspaceId, {
      flagOn: (id) => appEventsReleasedOrThrow(id),
      resolve: (app, id) => resolveBuiltInAppRelease(app, strictGateReader(id)),
    }),
    workspaceOn: (workspaceId) => appEventsReleasedOrThrow(workspaceId),
    webhooksOn: appEventWebhooksEnabled(),
    sendWebhook: (endpoint, event, attempt) => sendAppEventWebhook(endpoint, event, attempt),
    now: Date.now,
    deadlineMs: 45_000,
    laneLimit: 50,
    batch: 20,
    leaseSeconds: 120,
    handlerTimeoutMs: 10_000,
  };
}

/** A message safe to store and show: no address, no email, short. Never event data. */
export function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "failed";
  return text.replace(/https?:\/\/\S+/g, "<url>").replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "<email>").trim().slice(0, 300) || "failed";
}

async function withTimeout(run: (signal: AbortSignal) => Promise<void>, ms: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("timed out")); }, ms);
  });
  try {
    await Promise.race([run(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const bareEvent = (claimed: ClaimedLane["events"][number]): AppEvent => {
  const { allowed: _allowed, ...event } = claimed;
  void _allowed;
  return event;
};

const ERROR_LIMIT = 20;

/**
 * One delivery run. Order is strict within a lane (one business, one subscriber):
 * a failed Event holds back the ones after it until it is delivered, or set aside
 * after its attempts. Delivery is at least once, so handlers are idempotent on
 * event.id. Nothing here throws: a failure is recorded in `errors`.
 */
export async function dispatchAppEvents(deps: DispatchDeps = defaultDispatchDeps()): Promise<DispatchResult> {
  const { store } = deps;
  const started = deps.now();
  const deadline = started + deps.deadlineMs;
  const result: DispatchResult = {
    status: "ran", lanes: 0, delivered: 0, retried: 0, dead: 0, skipped: 0, unregistered: 0, leaseLost: 0,
    webhooks: { delivered: 0, retried: 0, dead: 0, skipped: 0, disabled: 0 },
    replays: { delivered: 0, failed: 0 }, purged: null, errors: [],
  };

  async function attempt<T>(run: () => Promise<T>): Promise<T | undefined> {
    try {
      return await run();
    } catch (error) {
      if (result.errors.length < ERROR_LIMIT) result.errors.push(safeError(error));
      return undefined;
    }
  }

  // 1. Cursors for every active (subscriber, business).
  const activeMemo = new Map<string, Awaited<ReturnType<DispatchDeps["activeFor"]>>>();
  const activeOf = async (workspaceId: string) => {
    const known = activeMemo.get(workspaceId);
    if (known) return known;
    const active = await attempt(() => deps.activeFor(workspaceId));
    if (active) activeMemo.set(workspaceId, active);
    return active;
  };
  const workspaces = (await attempt(() => store.recentWorkspaces(200))) ?? [];
  const pairs: { subscriber: string; workspaceId: string }[] = [];
  for (const workspaceId of workspaces) {
    if (deps.now() >= started + deps.deadlineMs * 0.4) break;
    const active = await activeOf(workspaceId);
    for (const subscriber of active?.keys() ?? []) pairs.push({ subscriber, workspaceId });
  }
  for (let at = 0; at < pairs.length; at += 500) {
    await attempt(() => store.ensureCursors(pairs.slice(at, at + 500)));
  }

  // 2. Webhook endpoints.
  const endpoints = new Map<string, WebhookEndpointTarget>();
  if (deps.webhooksOn) {
    for (const endpoint of (await attempt(() => store.activeWebhookEndpoints(200))) ?? []) endpoints.set(endpoint.id, endpoint);
  }

  // 3. Which lanes to claim.
  const subscribers = [...declaredSubscribers(deps.apps).map((entry) => entry.subscriber), ...[...endpoints.keys()].map(webhookSubscriberKey)];

  // 4 and 5. Claim, then deliver lane by lane.
  const lanes = subscribers.length
    ? (await attempt(() => store.claimLanes({ subscribers, limit: deps.laneLimit, leaseSeconds: deps.leaseSeconds, batch: deps.batch }))) ?? []
    : [];
  result.lanes = lanes.length;

  async function ack(lane: LaneRef, through: number): Promise<boolean> {
    const ok = await attempt(() => store.ackLane(lane, through));
    if (ok === false) result.leaseLost++;
    return ok === true;
  }

  for (let index = 0; index < lanes.length; index++) {
    const lane = lanes[index]!;
    if (deps.now() >= deadline) {
      for (const rest of lanes.slice(index)) await attempt(() => store.releaseLane(rest));
      break;
    }
    const key = parseSubscriberKey(lane.subscriber);
    let stopped = false;
    // Tries so far for the Event in hand. An ack resets the lane's count, so the next Event starts at one.
    let tries = lane.attempts + 1;

    if (key?.kind === "app") {
      const active = await activeOf(lane.workspaceId);
      if (!active) { await attempt(() => store.releaseLane(lane)); continue; }
      const subscription = active.get(lane.subscriber);
      if (!subscription) {
        await attempt(() => store.skipLane(lane));
        result.skipped++;
        continue;
      }
      const handler = deps.handlerFor(key.appId, key.handler);
      if (!handler) {
        await attempt(() => store.releaseLane(lane));
        result.unregistered++;
        continue;
      }
      for (const claimed of lane.events) {
        if (deps.now() >= deadline) break;
        if (!subscription.events.includes(claimed.type)) {
          if (!(await ack(lane, claimed.sequence))) { stopped = true; break; }
          continue;
        }
        const event = bareEvent(claimed);
        try {
          await withTimeout(
            (signal) => handler(event, {
              workspaceId: lane.workspaceId, appId: key.appId as BuiltInAppId, subscriber: lane.subscriber,
              attempt: tries, replay: false, signal,
            }),
            deps.handlerTimeoutMs,
          );
        } catch (error) {
          const outcome = await attempt(() => store.failLane(lane, event.id, {
            error: safeError(error), permanent: error instanceof PermanentAppEventError,
            maxAttempts: subscription.maxAttempts, backoffSeconds: backoffSeconds(tries),
          }));
          if (outcome === "dead") { result.dead++; tries = 1; continue; }
          if (outcome === "retry") result.retried++;
          else result.leaseLost++;
          stopped = true;
          break;
        }
        if (!(await ack(lane, claimed.sequence))) { stopped = true; break; }
        result.delivered++;
        tries = 1;
      }
      if (!stopped) await attempt(() => store.releaseLane(lane));
      continue;
    }

    if (key?.kind === "webhook") {
      const endpoint = endpoints.get(key.endpointId);
      // The App lanes above are already gated by activeFor, which includes the flag; this is the Webhook lanes' own check.
      const on = deps.webhooksOn && endpoint ? await attempt(() => deps.workspaceOn(lane.workspaceId)) : false;
      // A failed read is not "off": release the lane so its events are still there next run.
      if (on === undefined) { await attempt(() => store.releaseLane(lane)); continue; }
      if (!deps.webhooksOn || !endpoint || on !== true) {
        await attempt(() => store.skipLane(lane));
        result.webhooks.skipped++;
        continue;
      }
      for (const claimed of lane.events) {
        if (deps.now() >= deadline) break;
        if (!claimed.allowed || !endpoint.eventTypes.includes(claimed.type)) {
          if (!(await ack(lane, claimed.sequence))) { stopped = true; break; }
          continue;
        }
        const event = bareEvent(claimed);
        const outcome = await deps.sendWebhook(endpoint, event, tries).catch((): WebhookOutcome => "retry");
        if (outcome === "delivered") {
          if (!(await ack(lane, claimed.sequence))) { stopped = true; break; }
          result.webhooks.delivered++;
          tries = 1;
          continue;
        }
        if (outcome === "gone") {
          await attempt(() => store.disableEndpoint(endpoint.id, "gone"));
          result.webhooks.disabled++;
        }
        const failed = await attempt(() => store.failLane(lane, event.id, {
          error: outcome === "retry" ? "The address did not accept the event." : outcome === "gone" ? "The address is gone." : "The address refused the event.",
          permanent: outcome !== "retry", maxAttempts: APP_EVENT_MAX_ATTEMPTS, backoffSeconds: backoffSeconds(tries),
        }));
        if (failed === "dead") {
          result.webhooks.dead++;
          if (outcome === "gone") { stopped = true; break; }
          tries = 1;
          continue;
        }
        if (failed === "retry") result.webhooks.retried++;
        else result.leaseLost++;
        stopped = true;
        break;
      }
      if (!stopped) await attempt(() => store.releaseLane(lane));
      continue;
    }

    // A lane this code does not understand: leave it.
    await attempt(() => store.releaseLane(lane));
  }

  // 6. Replays a person asked for.
  if (deps.now() < deadline) {
    const replays = (await attempt(() => store.claimReplays(20, deps.leaseSeconds))) ?? [];
    for (const replay of replays) {
      // Replays left unrun keep their lease and are claimed again on the next run.
      if (deps.now() >= deadline) break;
      const key = parseSubscriberKey(replay.subscriber);
      let ok = false;
      let reason: string | null = null;
      try {
        if (!replay.event.id) throw new PermanentAppEventError("The event has no id.");
        const event: AppEvent = { ...replay.event, id: replay.event.id };
        if (key?.kind === "app") {
          const active = await activeOf(replay.workspaceId);
          const handler = deps.handlerFor(key.appId, key.handler);
          if (!active?.get(replay.subscriber)) throw new Error("The App is not receiving events for this business.");
          if (!handler) throw new Error("No handler is registered.");
          await withTimeout(
            (signal) => handler(event, {
              workspaceId: replay.workspaceId, appId: key.appId as BuiltInAppId, subscriber: replay.subscriber, attempt: 1, replay: true, signal,
            }),
            deps.handlerTimeoutMs,
          );
          ok = true;
        } else if (key?.kind === "webhook") {
          const endpoint = endpoints.get(key.endpointId);
          if (!deps.webhooksOn || !endpoint || !replay.allowed) throw new Error("The webhook is not receiving events.");
          // The business's app_events row may have been turned off since the event was set aside; a failed read counts as off.
          if (!(await deps.workspaceOn(replay.workspaceId).catch(() => false))) throw new Error("The webhook is not receiving events.");
          const outcome = await deps.sendWebhook(endpoint, event, 1);
          if (outcome !== "delivered") throw new Error("The address did not accept the event.");
          ok = true;
        } else {
          throw new Error("Unknown subscriber.");
        }
      } catch (error) {
        reason = safeError(error);
      }
      await attempt(() => store.finishReplay(replay.id, replay.leaseToken, ok, reason));
      if (ok) result.replays.delivered++;
      else result.replays.failed++;
    }
  }

  // 7. Retention.
  result.purged = (await attempt(() => store.purgeAppEvents(500))) ?? null;
  return result;
}
