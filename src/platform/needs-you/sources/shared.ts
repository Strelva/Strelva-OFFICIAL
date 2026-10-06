/**
 * Helpers shared by the workspace-lifecycle adapters in this folder. Each
 * adapter still resolves through its own lifecycle's resolver; these only
 * keep the common rules in one place.
 */
import { createHash } from "node:crypto";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { Decision, ProposedItem } from "../contracts";
import type { AdapterContext, ResolveBy, ResolveOutcome } from "../adapters";

/** A revision hash over the source's own revision and state. */
export function revisionOf(...parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

/** A title the owner_decisions row accepts: one line, trimmed, at most 200 characters. */
export function itemTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200).trim() || "A decision is waiting";
}

export function itemDetail(text: string | null | undefined): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 1000) : null;
}

export function workspaceHref(workspaceId: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ workspaceId, ...query });
  return `/workspace?${params.toString()}`.slice(0, 500);
}

/**
 * Not yet and a lapse change nothing at a source with no real decline: the
 * source keeps waiting on its own screen. Returns null when the adapter must
 * run its resolver.
 */
export function unchangedOutcome(decision: Decision, by: ResolveBy): ResolveOutcome | null {
  if (by.kind === "expiry") return { outcome: "done", reason: "Expired, nothing changed" };
  if (decision === "not_yet") return { outcome: "done", reason: "Not yet" };
  return null;
}

/** The member identity a workspace RPC rechecks. An owner link carries one only when the recipient is a member. */
export function memberActor(by: ResolveBy): WorkspaceActor | null {
  if (by.kind === "session") return by.actor;
  if (by.kind === "owner_link") return by.actor;
  return null;
}

/** Read pending asks as a member. Without an actor (the hourly cron) the source can't be read. */
export async function proposeAsMember(
  ctx: AdapterContext,
  read: (actor: WorkspaceActor) => Promise<ProposedItem[]>,
): Promise<{ items: ProposedItem[]; complete: boolean }> {
  if (!ctx.actor) return { items: [], complete: false };
  try {
    return { items: await read(ctx.actor), complete: true };
  } catch {
    return { items: [], complete: false };
  }
}

/** Split `<id>:<stage>` source ids. */
export function splitSource(sourceId: string): { id: string; stage: string } | null {
  const at = sourceId.lastIndexOf(":");
  if (at <= 0 || at === sourceId.length - 1) return null;
  return { id: sourceId.slice(0, at), stage: sourceId.slice(at + 1) };
}
