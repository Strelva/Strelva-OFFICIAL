import type { BuiltInAppId } from "@/platform/app-releases/contracts";
import type { AppEvent } from "./contracts";

export interface AppEventHandlerContext {
  workspaceId: string;
  appId: BuiltInAppId;
  /** `app:<appId>:<handler>` */
  subscriber: string;
  /** 1 on the first try. */
  attempt: number;
  /** True when a person asked for this Event to be tried again. */
  replay: boolean;
  /** Aborted when the handler runs out of time. */
  signal: AbortSignal;
}

/** Delivery is at least once: be idempotent on `event.id`. */
export type AppEventHandler = (event: AppEvent, context: AppEventHandlerContext) => Promise<void>;

/** Throw to set the Event aside at once (no retry): it can never succeed. */
export class PermanentAppEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentAppEventError";
  }
}

const registry = new Map<string, AppEventHandler>();
const keyOf = (appId: string, handler: string) => `${appId}:${handler}`;

/** Registered once at the app edge (src/server/app-events/handlers.ts). Idempotent for the same function; returns a cleanup. */
export function registerAppEventHandler(appId: BuiltInAppId, handler: string, run: AppEventHandler): () => void {
  const key = keyOf(appId, handler);
  const existing = registry.get(key);
  if (existing && existing !== run) throw new Error(`Handler ${key} is already registered`);
  registry.set(key, run);
  return () => { if (registry.get(key) === run) registry.delete(key); };
}

export function appEventHandlerFor(appId: string, handler: string): AppEventHandler | null {
  return registry.get(keyOf(appId, handler)) ?? null;
}

export function resetAppEventHandlers(): void {
  registry.clear();
}
