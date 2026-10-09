/**
 * Needs you source: putting an app live (needs-you spec section 6, "App or
 * custom app publish, rollback" → system.change_live; a first release is
 * system.go_live).
 *
 * What waits on the owner today:
 * - A native application (`src/products/applications`) whose candidate has a
 *   passing rehearsal for its current spec version and differs from the live
 *   release. Approve runs the lifecycle's own `publish` (RPC
 *   `publish_application_candidate`) at the exact candidate revision and
 *   release version the item was opened on.
 * - A custom application (`src/products/custom-applications`) whose built
 *   candidate artifact was reviewed and is not the live release. Approve runs
 *   the lifecycle's own `release` (RPC `custom_application_release`).
 *
 * Rollback is not proposed: nothing waits on anyone to roll back. It stays an
 * owner-started action on the app's own screen.
 *
 * Not yet and a lapse change nothing: the candidate stays where it is. Both
 * resolvers recheck the revision and the actor's authority, so a stale
 * approval refuses instead of publishing something else.
 */
import { createHash } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { ChangeKind, ProposedItem } from "../contracts";
import type { SourceAdapter } from "../adapters";

/** The slice of a native application the adapter reads. */
export interface NativeAppView {
  id: string;
  workspaceId: string;
  title: string;
  candidate: { designRevision: number; specVersion: number; spec: unknown; rehearsal: { specVersion: number; checks: { passed: boolean }[] } | null };
  /** The live release, when there is one. */
  release: { version: number; spec: unknown } | null;
}

/** The slice of a custom application the adapter reads. */
export interface CustomAppView {
  workId: string;
  workspaceId: string;
  title: string;
  status: "draft" | "released" | "retired";
  candidate: { revision: number; version: number; artifact: { artifactDigest: string; review: { artifactDigest: string } | null } | null };
  currentReleaseVersion: number | null;
  releases: { version: number; artifactDigest: string }[];
}

export interface ApplicationReleasePorts {
  listNative(actor: WorkspaceActor, workspaceId: string): Promise<NativeAppView[]>;
  listCustom(actor: WorkspaceActor, workspaceId: string): Promise<CustomAppView[]>;
  readNative(actor: WorkspaceActor, id: string): Promise<NativeAppView | null>;
  readCustom(actor: WorkspaceActor, id: string): Promise<CustomAppView | null>;
  /** The applications lifecycle's own publish. */
  publishNative(actor: WorkspaceActor, id: string, input: { expectedCandidateRevision: number; expectedReleaseVersion: number | null }): Promise<unknown>;
  /** The custom applications lifecycle's own release. */
  releaseCustom(actor: WorkspaceActor, id: string, input: { expectedCandidateRevision: number; expectedReleaseVersion: number | null }): Promise<unknown>;
}

function hash(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A native candidate waits on the owner when it rehearsed cleanly and differs from what is live. */
export function nativeReady(app: NativeAppView): boolean {
  const rehearsal = app.candidate.rehearsal;
  if (!rehearsal || rehearsal.specVersion !== app.candidate.specVersion || rehearsal.checks.some(check => !check.passed)) return false;
  return !app.release || stableJson(app.release.spec) !== stableJson(app.candidate.spec);
}

/** A custom candidate waits on the owner when its built artifact was reviewed and isn't live. */
export function customReady(app: CustomAppView): boolean {
  if (app.status === "retired") return false;
  const artifact = app.candidate.artifact;
  if (!artifact || !artifact.review || artifact.review.artifactDigest !== artifact.artifactDigest) return false;
  const live = app.releases.find(release => release.version === app.currentReleaseVersion);
  return live?.artifactDigest !== artifact.artifactDigest;
}

const nativeRevision = (app: NativeAppView) => hash(["native", app.id, app.candidate.designRevision, app.candidate.specVersion, app.release?.version ?? null]);
const customRevision = (app: CustomAppView) => hash(["custom", app.workId, app.candidate.revision, app.candidate.artifact?.artifactDigest ?? null, app.currentReleaseVersion]);

function item(input: { kind: ChangeKind; title: string; sourceId: string; revisionHash: string; openHref: string }): ProposedItem {
  const first = input.kind === "system.go_live";
  return {
    kind: input.kind,
    route: "owner_decides",
    title: (first ? `Put ${input.title} live` : `Approve the new release of ${input.title}`).slice(0, 200).trim(),
    detail: first ? "It passed its checks. Nobody can use it until you approve." : "It passed its checks. The live release stays until you approve.",
    approveEffect: first ? "It goes live for the people you give access to." : "The new release replaces the live one.",
    notYetEffect: "Nothing changes; it waits for you.",
    sourceLifecycle: "application_release",
    sourceId: input.sourceId,
    revisionHash: input.revisionHash,
    urgent: false,
    // system.go_live is owner-only; a change to a live app follows the lifecycle, which lets an admin manager release.
    adminMayDecide: !first,
    openHref: input.openHref,
  };
}

export function nativeAppItem(app: NativeAppView): ProposedItem | null {
  if (!nativeReady(app)) return null;
  return item({ kind: app.release ? "system.change_live" : "system.go_live", title: app.title, sourceId: `native:${app.id}`, revisionHash: nativeRevision(app), openHref: `/workspace?workspaceId=${encodeURIComponent(app.workspaceId)}&work=${encodeURIComponent(app.id)}` });
}

export function customAppItem(app: CustomAppView): ProposedItem | null {
  if (!customReady(app)) return null;
  return item({ kind: app.currentReleaseVersion === null ? "system.go_live" : "system.change_live", title: app.title, sourceId: `custom:${app.workId}`, revisionHash: customRevision(app), openHref: `/custom-applications/${app.workId}/manage` });
}

function split(sourceId: string): { kind: "native" | "custom"; id: string } | null {
  const [kind, id] = sourceId.split(":");
  if ((kind !== "native" && kind !== "custom") || !id) return null;
  return { kind, id };
}

export function applicationReleaseAdapter(ports: ApplicationReleasePorts): SourceAdapter {
  async function current(actor: WorkspaceActor, workspaceId: string, sourceId: string) {
    const source = split(sourceId);
    if (!source) return null;
    if (source.kind === "native") {
      const app = await ports.readNative(actor, source.id);
      return app && app.workspaceId === workspaceId && nativeReady(app) ? { kind: "native" as const, app, revision: nativeRevision(app) } : null;
    }
    const app = await ports.readCustom(actor, source.id);
    return app && app.workspaceId === workspaceId && customReady(app) ? { kind: "custom" as const, app, revision: customRevision(app) } : null;
  }
  return {
    lifecycle: "application_release",
    needsMemberActor: true,
    ownerLinkWithoutAccount: true,
    async propose(ctx) {
      if (!ctx.actor) return { items: [], complete: false };
      const items: ProposedItem[] = [];
      let complete = true;
      try {
        const apps = (await ports.listNative(ctx.actor, ctx.workspaceId)).filter(app => app.workspaceId === ctx.workspaceId);
        items.push(...apps.flatMap(app => nativeAppItem(app) ?? []));
      } catch { complete = false; }
      try {
        const apps = (await ports.listCustom(ctx.actor, ctx.workspaceId)).filter(app => app.workspaceId === ctx.workspaceId);
        items.push(...apps.flatMap(app => customAppItem(app) ?? []));
      } catch { complete = false; }
      return { items, complete };
    },
    async currentRevision(ctx, sourceId) {
      if (!ctx.actor) return null;
      return (await current(ctx.actor, ctx.workspaceId, sourceId))?.revision ?? null;
    },
    async resolve(ctx, item, decision, by) {
      if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
      if (decision === "not_yet") return { outcome: "done", reason: "Not yet" };
      const actor = by.actor;
      if (!actor) return { outcome: "failed", reason: "owner_not_member" };
      try {
        const found = await current(actor, ctx.workspaceId, item.sourceId);
        if (!found) return { outcome: "done", reason: "already_resolved" };
        if (found.revision !== item.revisionHash) return { outcome: "failed", reason: "changed_since_decision" };
        if (found.kind === "native") {
          await ports.publishNative(actor, found.app.id, { expectedCandidateRevision: found.app.candidate.designRevision, expectedReleaseVersion: found.app.release?.version ?? null });
          return { outcome: "done", receiptRef: `application_release:native:${found.app.id}:${found.app.candidate.designRevision}` };
        }
        await ports.releaseCustom(actor, found.app.workId, { expectedCandidateRevision: found.app.candidate.revision, expectedReleaseVersion: found.app.currentReleaseVersion });
        return { outcome: "done", receiptRef: `application_release:custom:${found.app.workId}:${found.app.candidate.revision}` };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
