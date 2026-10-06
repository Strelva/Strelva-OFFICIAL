import {
  BusinessEffortAccessError, BusinessEffortValidationError, EARLIEST_EFFORT_DATE,
  recordBusinessEffortSchema, voidBusinessEffortSchema,
  type BusinessEffortActor, type BusinessEffortEntry, type EffortBusiness,
  type RecordBusinessEffortCommand, type RecordBusinessEffortInput, type VoidBusinessEffortInput,
} from "./types";
import { effortWindowStart, measureBusinessEffort, type EffortMeasure } from "./measure";

export interface BusinessEffortStore {
  record(actor: BusinessEffortActor, input: RecordBusinessEffortCommand): Promise<BusinessEffortEntry>;
  void(actor: BusinessEffortActor, input: VoidBusinessEffortInput): Promise<BusinessEffortEntry>;
  listBusinesses(actor: BusinessEffortActor): Promise<EffortBusiness[]>;
  listEntries(actor: BusinessEffortActor, query: { from: string; businessId?: string }): Promise<BusinessEffortEntry[]>;
}

function requireActor(actor: BusinessEffortActor | null): BusinessEffortActor {
  if (!actor?.userId || !actor.verifiedEmail) throw new BusinessEffortAccessError();
  return actor;
}

/** Record one append-only entry. The server-issued entry id makes a retry safe. */
export async function recordBusinessEffort(
  store: BusinessEffortStore,
  actor: BusinessEffortActor | null,
  input: RecordBusinessEffortInput,
  now: Date = new Date(),
): Promise<BusinessEffortEntry> {
  const verified = requireActor(actor);
  const parsed = recordBusinessEffortSchema.safeParse(input);
  if (!parsed.success) throw new BusinessEffortValidationError();
  const today = now.toISOString().slice(0, 10);
  if (parsed.data.occurredOn > today || parsed.data.occurredOn < EARLIEST_EFFORT_DATE) {
    throw new BusinessEffortValidationError("Choose a date between 2020 and today (UTC).");
  }
  return store.record(verified, parsed.data);
}

/** Correct a mistaken entry by an append-only void record with a reason. */
export async function voidBusinessEffort(
  store: BusinessEffortStore,
  actor: BusinessEffortActor | null,
  input: VoidBusinessEffortInput,
): Promise<BusinessEffortEntry> {
  const verified = requireActor(actor);
  const parsed = voidBusinessEffortSchema.safeParse(input);
  if (!parsed.success) throw new BusinessEffortValidationError("Give a short reason for voiding this entry.");
  return store.void(verified, parsed.data);
}

export interface BusinessEffortOverview {
  businesses: EffortBusiness[];
  /** Newest first, voided entries included for history. */
  entries: BusinessEffortEntry[];
  measure: EffortMeasure;
}

export async function readBusinessEffortOverview(
  store: BusinessEffortStore,
  actor: BusinessEffortActor | null,
  now: Date = new Date(),
): Promise<BusinessEffortOverview> {
  const verified = requireActor(actor);
  const [businesses, entries] = await Promise.all([
    store.listBusinesses(verified),
    store.listEntries(verified, { from: effortWindowStart(now) }),
  ]);
  return { businesses, entries, measure: measureBusinessEffort({ businesses, entries, now }) };
}
