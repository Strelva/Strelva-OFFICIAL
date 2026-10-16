import type { WorkspaceSnapshot, WorkspaceSystemActivation } from "@/experience/workspace/contracts";

/**
 * After a live Make real starts, read back what landed instead of asking the
 * owner to reload. One read is the same GET /api/workspace the workspace
 * itself loads, so nothing here is a second source of truth:
 *
 * - the Possibility's activation still listed: it is running (or partly live)
 *   with its real step lines;
 * - the activation and the Possibility both gone: it finished, and the newest
 *   What changed receipt for the System (if any) says what landed;
 * - the Systems read unavailable: nothing is claimed.
 */
export type MakeRealReadBack =
  | { kind: "running"; activation: WorkspaceSystemActivation }
  | { kind: "finished"; sentence: string | null }
  | { kind: "waiting" }
  | { kind: "unavailable" };

export async function readMakeRealOnce(request: typeof fetch, input: { workspaceId: string; systemId: string; possibilityId: string; activationId?: string | null; since: number }): Promise<MakeRealReadBack> {
  try {
    const response = await request(`/api/workspace?${new URLSearchParams({ workspaceId: input.workspaceId })}`, { cache: "no-store" });
    if (!response.ok) return { kind: "unavailable" };
    const snapshot = await response.json() as Partial<WorkspaceSnapshot>;
    const systems = snapshot.systems;
    if (!systems || systems.status !== "ready") return { kind: "unavailable" };
    const activation = systems.activations?.find(item => item.possibilityId === input.possibilityId || (input.activationId ? item.id === input.activationId : false));
    if (activation) return { kind: "running", activation };
    if (!systems.activations) return { kind: "unavailable" };
    if (systems.possibilities.some(item => item.id === input.possibilityId)) return { kind: "waiting" };
    const receipt = (systems.handled ?? [])
      .filter(item => item.systemId === input.systemId && Date.parse(item.at) >= input.since - 60_000)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    return { kind: "finished", sentence: receipt?.sentence ?? null };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Reads until it settles or `tries` run out, reporting each read. Stops when `signal` aborts. */
export async function followMakeReal(request: typeof fetch, input: Parameters<typeof readMakeRealOnce>[1], onRead: (read: MakeRealReadBack) => void, options: { tries?: number; everyMs?: number; signal?: AbortSignal } = {}): Promise<MakeRealReadBack> {
  const tries = options.tries ?? 12;
  const every = options.everyMs ?? 1500;
  let last: MakeRealReadBack = { kind: "waiting" };
  for (let attempt = 0; attempt < tries; attempt++) {
    if (options.signal?.aborted) return last;
    last = await readMakeRealOnce(request, input);
    if (options.signal?.aborted) return last;
    onRead(last);
    if (last.kind === "finished" || last.kind === "unavailable") return last;
    if (last.kind === "running" && last.activation.status !== "in_progress") return last;
    await new Promise(resolve => setTimeout(resolve, every));
  }
  return last;
}
