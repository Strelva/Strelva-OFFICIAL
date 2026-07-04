/**
 * Lightweight operator workflow status for onboard-form leads. Layered ON TOP of
 * the migration-sensitive lead storage (Sanity / `access-request-delivery`) — this
 * store NEVER touches the lead record itself, it only tracks how the operator is
 * working the lead, keyed by the lead's stable `statusToken`.
 *
 * One JSON blob per lead in Redis at `lead-workflow:{statusToken}` — same pattern
 * as the operator CRM (`tenant-crm.ts`), pay-links, and leads. No DB migration:
 * internal operator metadata for a handful of leads, read-modify-write, degrades
 * to a default `new` record when Redis is unconfigured.
 */
import { getRedis } from "@/lib/redis";

export type LeadWorkflowStatus = "new" | "contacted" | "converted" | "dismissed";

export interface LeadWorkflow {
  token: string;
  status: LeadWorkflowStatus;
  note?: string;
  updatedAt: string | null;
}

export const LEAD_WORKFLOW_STATUSES: LeadWorkflowStatus[] = [
  "new",
  "contacted",
  "converted",
  "dismissed",
];

const MAX_NOTE_LEN = 2000;

function key(token: string): string {
  return `lead-workflow:${token}`;
}

/** The lead statusToken is a 36-char hex string (see access-request-delivery). */
function validToken(token: string): boolean {
  return /^[a-f0-9]{36}$/.test(token);
}

function defaultWorkflow(token: string): LeadWorkflow {
  return { token, status: "new", updatedAt: null };
}

function isStatus(value: unknown): value is LeadWorkflowStatus {
  return typeof value === "string" && LEAD_WORKFLOW_STATUSES.includes(value as LeadWorkflowStatus);
}

/** Normalize a raw stored value (object or JSON string) into a full LeadWorkflow. */
function normalize(token: string, raw: unknown): LeadWorkflow {
  if (!raw) return defaultWorkflow(token);
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return defaultWorkflow(token);
    }
  }
  const r = obj as Partial<LeadWorkflow>;
  const note = typeof r.note === "string" ? r.note.trim().slice(0, MAX_NOTE_LEN) : "";
  return {
    token,
    status: isStatus(r.status) ? r.status : "new",
    ...(note ? { note } : {}),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

export async function getLeadWorkflow(token: string): Promise<LeadWorkflow> {
  const redis = getRedis();
  if (!redis || !validToken(token)) return defaultWorkflow(token);
  const raw = await redis.get(key(token));
  return normalize(token, raw);
}

export async function getAllLeadWorkflow(tokens: string[]): Promise<Record<string, LeadWorkflow>> {
  const out: Record<string, LeadWorkflow> = {};
  const redis = getRedis();
  if (!redis || tokens.length === 0) {
    for (const token of tokens) out[token] = defaultWorkflow(token);
    return out;
  }
  const raws = await redis.mget<unknown[]>(...tokens.map(key));
  tokens.forEach((token, i) => {
    out[token] = normalize(token, raws?.[i]);
  });
  return out;
}

export async function setLeadWorkflowStatus(
  token: string,
  status: LeadWorkflowStatus,
  note?: string,
): Promise<LeadWorkflow> {
  const current = await getLeadWorkflow(token);
  const cleanNote = typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LEN) : undefined;
  const next: LeadWorkflow = {
    token,
    status: isStatus(status) ? status : "new",
    ...(cleanNote ? { note: cleanNote } : current.note ? { note: current.note } : {}),
    updatedAt: new Date().toISOString(),
  };
  const redis = getRedis();
  if (redis && validToken(token)) await redis.set(key(token), next);
  return next;
}
