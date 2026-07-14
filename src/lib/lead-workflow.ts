/**
 * Operator projection of the canonical delivery-lead lifecycle. Status changes
 * update the DeliveryLead first; this small Redis record retains operator notes
 * and remains as a compatibility cache for leads created before the projection.
 *
 * One JSON blob per lead in Redis at `lead-workflow:{statusToken}` — same pattern
 * as the operator CRM (`tenant-crm.ts`), pay-links, and leads. No DB migration:
 * internal operator metadata for a handful of leads, read-modify-write, degrades
 * to a default `new` record when Redis is unconfigured.
 */
import { getRedis } from "@/lib/redis";
import {
  getDeliveryLeadByToken,
  updateDeliveryLeadStatus,
  type DeliveryStatus,
} from "@/lib/access-request-delivery";

export type LeadWorkflowStatus = "new" | "contacted" | "converting" | "converted" | "dismissed";

export interface LeadWorkflow {
  token: string;
  status: LeadWorkflowStatus;
  note?: string;
  updatedAt: string | null;
}

// `converting` is the intermediate state set when the operator clicks Convert and
// hands off to the onboard form. It flips to `converted` ONLY when provisioning
// actually creates the tenant — so an abandoned onboard leaves a visible
// "Converting…" lead, never a mislabeled "Converted" lead with no tenant.
export const LEAD_WORKFLOW_STATUSES: LeadWorkflowStatus[] = [
  "new",
  "contacted",
  "converting",
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

const DELIVERY_FROM_WORKFLOW: Record<LeadWorkflowStatus, DeliveryStatus> = {
  new: "received",
  contacted: "reviewing",
  converting: "drafting",
  converted: "launched",
  dismissed: "paused",
};

export function workflowStatusFromDelivery(status: DeliveryStatus): LeadWorkflowStatus {
  if (status === "received") return "new";
  if (status === "reviewing") return "contacted";
  if (status === "launched") return "converted";
  if (status === "paused") return "dismissed";
  return "converting";
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
  if (!validToken(token)) return defaultWorkflow(token);
  const [lead, raw] = await Promise.all([
    getDeliveryLeadByToken(token),
    redis ? redis.get(key(token)) : Promise.resolve(null),
  ]);
  const cached = normalize(token, raw);
  if (!lead) return cached;
  return {
    ...cached,
    status: workflowStatusFromDelivery(lead.deliveryStatus),
    updatedAt: lead.statusUpdatedAt,
  };
}

export async function getAllLeadWorkflow(tokens: string[]): Promise<Record<string, LeadWorkflow>> {
  const workflows = await Promise.all(tokens.map((token) => getLeadWorkflow(token)));
  return Object.fromEntries(workflows.map((workflow) => [workflow.token, workflow]));
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
  // DeliveryLead is the lifecycle source of truth. If the token belongs to a
  // lead, update it before refreshing the operator projection/cache.
  const canonical = await updateDeliveryLeadStatus(token, DELIVERY_FROM_WORKFLOW[next.status]);
  if (canonical) next.updatedAt = canonical.statusUpdatedAt;
  const redis = getRedis();
  if (redis && validToken(token)) await redis.set(key(token), next);
  return next;
}
