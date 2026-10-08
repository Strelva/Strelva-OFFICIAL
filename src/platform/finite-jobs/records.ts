import { z } from "zod";

/** A finite job has one identity. Native rows are facets, never extra jobs or new authority. */
export const finiteJobSourceSchema = z.object({
  id: z.string().uuid(),
}).passthrough();
export type FiniteJobSource = z.infer<typeof finiteJobSourceSchema>;
export const finiteJobSourcesSchema = z.object({
  requests: z.array(finiteJobSourceSchema),
  deliveries: z.array(finiteJobSourceSchema),
  work: z.array(finiteJobSourceSchema),
  budgets: z.array(finiteJobSourceSchema),
}).strict();
export type FiniteJobSources = z.infer<typeof finiteJobSourcesSchema>;

export interface FiniteJobRecord {
  id: string;
  businessId: string;
  /** Status stays on its facet: provider acceptance is not scope/deadline acceptance. */
  request: FiniteJobSource | null;
  delivery: FiniteJobSource | null;
  work: FiniteJobSource | null;
  budgets: FiniteJobSource[];
}

export class FiniteJobIntegrityError extends Error {
  constructor(message: string) { super(message); this.name = "FiniteJobIntegrityError"; }
}

/**
 * Fold only explicit, database-owned links: request.delivery_id and budget.work_id.
 * Neither names nor caller-owned context establish identity. No persisted copy
 * means source updates, cancellations and budget settlements are immediately current.
 */
export function combineFiniteJobs(businessId: string, input: FiniteJobSources): FiniteJobRecord[] {
  z.string().uuid().parse(businessId);
  const sources = finiteJobSourcesSchema.parse(input);
  const seen = new Set<string>();
  for (const [kind, rows] of Object.entries(sources)) {
    for (const row of rows) {
      const key = `${kind}:${row.id}`;
      if (seen.has(key)) throw new FiniteJobIntegrityError(`Duplicate ${kind} reference.`);
      seen.add(key);
      const workspace = row.business_workspace_id ?? row.workspace_id;
      if (workspace !== businessId) throw new FiniteJobIntegrityError("A finite job belongs to another business.");
    }
  }
  const deliveries = new Map(sources.deliveries.map(row => [row.id, row]));
  const claimedDeliveries = new Set<string>();
  const jobs: FiniteJobRecord[] = sources.requests.map(request => {
    const deliveryId = typeof request.delivery_id === "string" ? request.delivery_id : null;
    const delivery = deliveryId ? deliveries.get(deliveryId) ?? null : null;
    if (deliveryId && !delivery) throw new FiniteJobIntegrityError("A linked delivery could not be read.");
    // Historical requests can point to the same delivery; preserve each request
    // rather than invent a new shared job or erase its agreed terms.
    if (delivery) claimedDeliveries.add(delivery.id);
    return { id: `request:${request.id}`, businessId, request, delivery, work: null, budgets: [] };
  });
  for (const delivery of sources.deliveries) {
    if (!claimedDeliveries.has(delivery.id)) jobs.push({ id: `delivery:${delivery.id}`, businessId, request: null, delivery, work: null, budgets: [] });
  }
  const claimedBudgets = new Set<string>();
  for (const work of sources.work) {
    const budgets = sources.budgets.filter(row => row.work_id === work.id);
    for (const budget of budgets) claimedBudgets.add(budget.id);
    jobs.push({ id: `work:${work.id}`, businessId, request: null, delivery: null, work, budgets });
  }
  for (const budget of sources.budgets) {
    if (!claimedBudgets.has(budget.id)) jobs.push({ id: `budget:${budget.id}`, businessId, request: null, delivery: null, work: null, budgets: [budget] });
  }
  return jobs;
}

/** Compatibility adapters keep the native public shape and native command authority. */
export const finiteJobRequests = (jobs: readonly FiniteJobRecord[]) => jobs.flatMap(job => job.request ? [job.request] : []);
export function finiteJobDeliveries(jobs: readonly FiniteJobRecord[]): FiniteJobSource[] {
  return [...new Map(jobs.flatMap(job => job.delivery ? [[job.delivery.id, job.delivery] as const] : [])).values()];
}
