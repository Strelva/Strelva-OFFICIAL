import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/db/server-client";
import { isRateLimitedWindowedAsync } from "@/lib/rate-limit";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { listWorkspaceDiscoveryProducts } from "@/platform/products";
import {
  acceptHandoff, createAgencyWorkspace, createHandoff, ensurePersonalWorkspace, getWork,
  inspectHandoff, listAgencyDelegations, listAgencyHandoffs, listWork,
  listWorkDelegations, listWorkspaces, revokeDelegation, revokeHandoff,
  WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError,
  type WorkspaceActor, type Delegation,
} from "@/platform/workspaces";
import {
  runPrivateAiVisibilityAssessment,
  savePublicAiVisibilityResult,
} from "@/products/ai-visibility/server";
import { listManagedPresenceWork } from "@/products/managed-presence/server";
import { presentWorkspaceWork } from "@/experience/workspace/result";
import type { ManagedWork, WorkspaceDelegation, WorkspaceSnapshot } from "@/experience/workspace/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_agency"), name: boundedText(120) }).strict(),
  z.object({ action: z.literal("assess"), workspaceId: z.string().uuid(),
    business: boundedText(160), url: z.string().trim().max(2048).optional(),
    category: z.string().trim().max(160).optional(), location: z.string().trim().max(160).optional() }).strict(),
  z.object({ action: z.literal("save_public_result"), workspaceId: z.string().uuid(),
    resultId: z.string().trim().regex(/^scan_[a-z0-9]+$/i).max(256) }).strict(),
  z.object({ action: z.literal("handoff"), workId: z.string().uuid(), recipientEmail: z.string().trim().email().max(254) }).strict(),
  z.object({ action: z.literal("inspect_handoff"), token: boundedText(256) }).strict(),
  z.object({ action: z.literal("accept_handoff"), token: boundedText(256), allowAgencyAccess: z.boolean() }).strict(),
  z.object({ action: z.literal("revoke_delegation"), delegationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("revoke_handoff"), handoffId: z.string().uuid() }).strict(),
]);

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: {
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  } });
}

async function actor(): Promise<WorkspaceActor | null> {
  const user = await getSessionUser();
  if (!user?.email || !user.email_confirmed_at) return null;
  return { userId: user.id, verifiedEmail: user.email.trim().toLowerCase() };
}

function failed(error: unknown) {
  if (error instanceof WorkspaceAccessError) return json({ error: "This work or invitation is unavailable to your account." }, 403);
  if (error instanceof WorkspaceConflictError) return json({ error: "This action is no longer available or a workspace limit has been reached. Refresh your workspace before continuing." }, 409);
  if (error instanceof Error && ["PrivateAiVisibilityAssessmentRateLimitError", "PublicAiVisibilityImportRateLimitError"].includes(error.name)) {
    return json({ error: error.name === "PublicAiVisibilityImportRateLimitError"
      ? "You've reached the daily saved-result limit. Try again tomorrow."
      : "You've reached the daily assessment limit. Try again tomorrow." }, 429);
  }
  if (error instanceof Error && error.name === "PublicAiVisibilityResultUnavailableError") {
    return json({ error: "That public scorecard is no longer available to save." }, 404);
  }
  if (error instanceof z.ZodError) return json({ error: "Check the information supplied and try again." }, 400);
  // Do not expose database details, recipient addresses, credentials, or provider errors.
  if (error instanceof WorkspaceStoreError) return json({ error: "Saved work is unavailable right now. Nothing has been confirmed. Please try again." }, 503);
  return json({ error: "We couldn't complete this request. Please try again." }, 503);
}

/** Enforce an actual byte limit, including chunked requests without Content-Length. */
async function body(request: Request): Promise<unknown> {
  if (!request.body) throw new z.ZodError([]);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 12_000) { await reader.cancel(); throw new z.ZodError([]); }
      raw += decoder.decode(next.value, { stream: true });
    }
    raw += decoder.decode();
    try { return JSON.parse(raw); } catch { throw new z.ZodError([]); }
  } finally { reader.releaseLock(); }
}

function presentDelegation(delegation: Delegation, canRevoke: boolean): WorkspaceDelegation {
  return { id: delegation.id, workId: delegation.customerWorkId,
    agencyWorkspaceId: delegation.agencyWorkspaceId, status: delegation.status, canRevoke };
}

/**
 * Keep the HTTP boundary narrow even if the managed-presence adapter grows
 * server-only fields later. The workspace receives links, not tenant config,
 * credentials, membership rows, or operator metadata.
 */
function presentManagedWorkListing(value: unknown): { managedWork: ManagedWork[]; unavailable: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { managedWork: [], unavailable: true };
  }
  const source = value as Record<string, unknown>;
  const managedWork = Array.isArray(source.managedWork)
    ? source.managedWork.flatMap((candidate): ManagedWork[] => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
      const item = candidate as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id.trim().slice(0, 160) : "";
      const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
      const href = typeof item.href === "string" ? item.href.trim().slice(0, 2048) : "";
      const relationship = item.relationship === "enterprise" || item.relationship === "client"
        ? item.relationship : null;
      if (!id || !title || !href || item.productId !== "managed_presence" || !relationship) return [];
      return [{ id, title, href, productId: "managed_presence", relationship }];
    })
    : [];
  return { managedWork, unavailable: source.unavailable === true || !Array.isArray(source.managedWork) };
}

export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in with a confirmed email to open your work." }, 401);
    const query = new URL(request.url).searchParams;
    const personal = await ensurePersonalWorkspace(current);
    const workspaces = await listWorkspaces(current);
    const selectedId = query.get("workspaceId") || personal.id;
    z.string().uuid().parse(selectedId);
    const selected = workspaces.find((workspace) => workspace.id === selectedId);
    if (!selected) return json({ error: "Workspace unavailable." }, 404);
    // Managed presence is a compatibility projection of existing tenant
    // entities. A transient tenant read must not make unrelated private work
    // unavailable; the product reports a bounded status alongside successes.
    const managedPresence = presentManagedWorkListing(
      await listManagedPresenceWork().catch(() => ({ managedWork: [], unavailable: true })),
    );
    const work = await listWork(current, selected.id);
    const handoffs = selected.kind === "agency" && selected.access === "member"
      ? await listAgencyHandoffs(current, selected.id) : [];
    const agencyDelegations = selected.kind === "agency" && selected.access === "member"
      ? await listAgencyDelegations(current, selected.id) : [];
    const customerDelegations = selected.access === "member" && (selected.role === "owner" || selected.role === "admin")
      ? (await Promise.all(work.map((item) => listWorkDelegations(current, item.id)))).flat() : [];
    const snapshot: WorkspaceSnapshot = {
      actor: { email: current.verifiedEmail, localPreview: false },
      workspaces: workspaces.map(({ id, kind, name, access }) => ({ id, kind, name, access })), workspaceId: selected.id,
      work: work.map(presentWorkspaceWork),
      managedWork: managedPresence.managedWork,
      ...(managedPresence.unavailable ? { managedWorkUnavailable: true } : {}),
      handoffs: handoffs.map(({ id, sourceWorkId, recipientEmail, status, expiresAt, createdAt }) => ({ id, sourceWorkId, recipientEmail, status, expiresAt, createdAt })),
      delegations: [...agencyDelegations.map((value) => presentDelegation(value, false)), ...customerDelegations.map((value) => presentDelegation(value, true))],
      products: listWorkspaceDiscoveryProducts().map((product) => ({ id: product.id, name: product.name, description: product.promise,
        availability: product.release.availability === "public" ? "available"
          : product.release.availability === "not_enabled" ? "not_enabled" : "managed" })),
    };
    return json(snapshot);
  } catch (error) { return failed(error); }
}

export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return json({ error: "The workspace release is not enabled." }, 503);
  // Cookie authentication alone is insufficient for a cross-site mutation.
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Open Strelva directly to make this change." }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Send a JSON request." }, 415);
  try {
    const current = await actor();
    if (!current) return json({ error: "Sign in with a confirmed email to continue." }, 401);
    const input = actions.parse(await body(request));
    if (await isRateLimitedWindowedAsync(`workspace:write:${current.userId}`, 60, 60_000)) return json({ error: "Please wait before making another change." }, 429);
    switch (input.action) {
      case "inspect_handoff": {
        const preview = await inspectHandoff(current, input.token);
        return json({ recipientEmail: preview.recipientEmail, agencyName: preview.agencyWorkspace.name,
          work: presentWorkspaceWork(preview.work), expiresAt: preview.expiresAt, accepted: preview.status === "accepted" });
      }
      case "create_agency": {
        const workspace = await createAgencyWorkspace(current, input.name);
        return json({ workspaceId: workspace.id }, 201);
      }
      case "assess": {
        const scoreInput = { business: input.business, url: input.url || undefined, category: input.category || undefined, location: input.location || undefined };
        const work = await runPrivateAiVisibilityAssessment({ actor: current, workspaceId: input.workspaceId, input: scoreInput });
        return json({ work: presentWorkspaceWork(work) }, 201);
      }
      case "save_public_result": {
        const saved = await savePublicAiVisibilityResult({ actor: current, workspaceId: input.workspaceId, resultId: input.resultId });
        return json({ work: presentWorkspaceWork(saved.work), alreadySaved: !saved.created }, saved.created ? 201 : 200);
      }
      case "handoff": {
        const work = await getWork(current, input.workId);
        if (!work) return json({ error: "Saved work unavailable." }, 404);
        if (!presentWorkspaceWork(work).payload) return json({ error: "This product does not support handoffs in this release." }, 409);
        const result = await createHandoff(current, input.workId, input.recipientEmail);
        return json({ token: result.token }, 201);
      }
      case "accept_handoff": {
        const accepted = await acceptHandoff(current, input.token, input.allowAgencyAccess);
        return json({ workspaceId: accepted.customerWorkspaceId, workId: accepted.customerWorkId });
      }
      case "revoke_delegation":
        if (!await revokeDelegation(current, input.delegationId)) throw new WorkspaceAccessError();
        return json({ ok: true });
      case "revoke_handoff":
        if (!await revokeHandoff(current, input.handoffId)) throw new WorkspaceAccessError();
        return json({ ok: true });
    }
  } catch (error) { return failed(error); }
}
