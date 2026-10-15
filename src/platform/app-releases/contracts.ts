import { z } from "zod";
import { requiredConnectionSchema, type RequiredConnection } from "@/platform/connections/contracts";
import { RELEASE_FLAGS, type ReleaseFlag } from "@/platform/release-flags/resolve";
import type { MakeRealChannel } from "@/platform/possibilities/contracts";
import type { AppEventSubscription } from "@/platform/app-events/contracts";

export const BUILT_IN_APP_IDS = ["bookings", "inquiries", "recaps", "documents", "ask", "internal_tools", "care_reports"] as const;
export type BuiltInAppId = (typeof BUILT_IN_APP_IDS)[number];
export const builtInAppIdSchema = z.enum(BUILT_IN_APP_IDS);

/** One switch a Release (or the App itself) needs. workspace_flag = per-business rollout and rollback through the existing flag rows; env = everywhere at once. */
export type AppReleaseGate =
  | { kind: "workspace_flag"; flag: ReleaseFlag }
  | { kind: "env"; name: string; values: readonly string[] };
export const appReleaseGateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace_flag"), flag: z.enum(RELEASE_FLAGS) }).strict(),
  z.object({ kind: z.literal("env"), name: z.string().regex(/^STRELVA_[A-Z0-9_]+$/), values: z.array(z.string().min(1)).min(1) }).strict(),
]);

export interface BuiltInAppRelease {
  /** Stable across renumbering: `<appId>.<slug>`. Code gates by key, never by number. */
  key: string;
  /** 1-based, contiguous, equals its index + 1. Shown as "Release N". */
  number: number;
  /** One owner-readable sentence, GLOSSARY words only. */
  summary: string;
  /** Product version it shipped in ("1.0.0"), or null while merged but not deployed. */
  shippedIn: string | null;
  /** True when turning it on changes what a live business sees or what is sent. */
  changesLiveBehavior: boolean;
  /** Gates this Release introduces (its own). Release N is on only if every Release 1..N has its own gates on. */
  gates: readonly AppReleaseGate[];
  /** The full list for this Release, not a delta. [] means no outside accounts. */
  requiredConnections: readonly RequiredConnection[];
  /** Events this Release handles. Full list, not a delta; absent means none. */
  eventSubscriptions?: readonly AppEventSubscription[];
}

export interface BuiltInApp {
  id: BuiltInAppId;
  /** On-screen name, also used in labels: "Bookings Release 2". */
  name: string;
  /** Platform-made, credited "Strelva". Never an agency id (ADR 0012: Strelva Agency gets no carve-out). */
  publisher: "platform";
  /** Spine System kinds (src/platform/systems/contracts.ts KNOWN_SYSTEM_KINDS) this App gives a business. */
  systemKinds: readonly string[];
  /** False when the System has its own numbered Releases that must not be confused with this one (internal tools). */
  labelOnSystems: boolean;
  /** Make it live channels whose readiness uses this App's required Connections. */
  makeRealChannels: readonly MakeRealChannel[];
  /** Gates that decide whether the App is present for a business at all. */
  availability: readonly AppReleaseGate[];
  releases: readonly BuiltInAppRelease[];
}

export type BuiltInAppReleaseState =
  | { appId: BuiltInAppId; available: false }
  | {
      appId: BuiltInAppId;
      available: true;
      release: number;
      key: string;
      latest: number;
      /** The first Release not on here, with the gates it waits for. */
      heldBack: { number: number; key: string; gates: AppReleaseGate[] } | null;
      requiredConnections: RequiredConnection[];
    };

/** What the workspace snapshot carries per available App. */
export const builtInAppReleaseViewSchema = z.object({
  appId: builtInAppIdSchema,
  name: z.string(),
  release: z.number().int().positive(),
  latest: z.number().int().positive(),
  label: z.string(),
  requiredConnections: z.array(requiredConnectionSchema),
}).strict();
export type BuiltInAppReleaseView = z.infer<typeof builtInAppReleaseViewSchema>;

export interface RollbackPlan {
  from: number;
  to: number;
  turnOff: AppReleaseGate[];
  scope: "business" | "everywhere" | "redeploy";
}
