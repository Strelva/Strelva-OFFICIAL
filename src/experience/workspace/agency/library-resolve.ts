/**
 * Resolve a Library conflict inline, through the same Version choice the
 * client's System uses (`/api/workspace/versions`, action "adopt"). The read
 * comes first so the choice is made against the exact offer and row revision
 * on the server; nothing goes live, the owner still reviews the result.
 */
import { z } from "zod";

export type ConflictChoice = "keep_local" | "take_upstream";

const viewSchema = z.object({
  workspaceId: z.string(),
  systemId: z.string(),
  versionId: z.string(),
  rowRevision: z.number().int().positive(),
  canManage: z.boolean(),
  possibilities: z.array(z.object({
    sourceRevision: z.number().int().positive(),
    conflicts: z.array(z.object({ path: z.string(), locked: z.boolean().optional() }).passthrough()),
    missingAccounts: z.array(z.string()),
  }).passthrough()),
}).passthrough();

const resultSchema = z.object({ outcome: z.enum(["prepared", "declined", "conflicted"]), rowRevision: z.number().int().positive() }).passthrough();

export class LibraryResolveError extends Error {}

function message(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export async function resolveLibraryConflict(request: typeof fetch, input: { workspaceId: string; systemId: string; versionId: string; choices: Readonly<Record<string, ConflictChoice>> }): Promise<"prepared" | "conflicted"> {
  const read = await request(`/api/workspace/versions?${new URLSearchParams({ workspaceId: input.workspaceId, systemId: input.systemId })}`, { credentials: "same-origin", cache: "no-store" });
  const readBody: unknown = await read.json().catch(() => null);
  if (!read.ok) throw new LibraryResolveError(message(readBody, "This client's System could not be read. Nothing changed."));
  const view = viewSchema.safeParse(readBody);
  if (!view.success || view.data.workspaceId !== input.workspaceId || view.data.systemId !== input.systemId || view.data.versionId !== input.versionId) throw new LibraryResolveError("This client's System answered for another Version. Nothing changed. Refresh the Library.");
  if (!view.data.canManage) throw new LibraryResolveError("You can't make this choice on this client's System. Nothing changed.");
  const offer = view.data.possibilities.at(-1);
  if (!offer) throw new LibraryResolveError("Nothing is waiting for a choice on this System any more. Refresh the Library.");
  if (offer.missingAccounts.length) throw new LibraryResolveError("This client needs a Connection first. Nothing changed.");
  const resolutions = offer.conflicts.map(conflict => {
    const choice = input.choices[conflict.path];
    if (!choice) throw new LibraryResolveError("This System changed since the Library was read. Refresh the Library and choose again.");
    if (choice === "keep_local" && conflict.locked) throw new LibraryResolveError("This client's own value can't be kept for this part. Choose the new default.");
    return { path: conflict.path, choice };
  });
  const write = await request("/api/workspace/versions", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId: input.workspaceId, systemId: input.systemId, versionId: input.versionId, rowRevision: view.data.rowRevision, action: "adopt", revision: offer.sourceRevision, resolutions }),
  });
  const writeBody: unknown = await write.json().catch(() => null);
  if (!write.ok) throw new LibraryResolveError(message(writeBody, "The choice could not be confirmed. Nothing went live."));
  const result = resultSchema.safeParse(writeBody);
  if (!result.success || result.data.outcome === "declined") throw new LibraryResolveError("The choice could not be confirmed. Nothing went live.");
  return result.data.outcome;
}
