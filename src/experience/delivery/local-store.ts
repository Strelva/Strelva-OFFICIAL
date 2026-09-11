import { z } from "zod";
import { beginRequestSession, type RequestSession } from "./request-session";

const stored = z.object({
  version: z.literal(1),
  requests: z.array(z.object({
    id: z.string().min(1).max(128),
    clientId: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4000),
    stage: z.enum(["draft", "scoping", "building", "review", "delivered"]),
    note: z.string().max(4000).optional(),
  }).strict()).max(200),
}).strict();

/** Local review only. Scope comes from the fixture, never from browser storage. */
export function restoreLocalSession(raw: string | null, baseline: RequestSession): RequestSession {
  if (raw === null) return baseline;
  if (raw.length > 1_000_000) throw new Error("Local review data is too large.");
  const { requests } = stored.parse(JSON.parse(raw));
  if (new Set(requests.map(item => item.id)).size !== requests.length)
    throw new Error("Local review data has duplicate requests.");
  return beginRequestSession({ ...baseline, requests });
}
export function serializeLocalSession(session: RequestSession): string {
  return JSON.stringify(stored.parse({ version: 1, requests: session.requests }));
}
