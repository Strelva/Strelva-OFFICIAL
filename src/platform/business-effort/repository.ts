import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import {
  BusinessEffortAccessError, BusinessEffortConflictError, BusinessEffortNotFoundError,
  BusinessEffortUnavailableError, BusinessEffortValidationError, businessEffortEntrySchema,
  effortBusinessSchema, type BusinessEffortActor, type BusinessEffortEntry, type EffortBusiness,
} from "./types";
import type { BusinessEffortStore } from "./service";

type Failure = { code?: string; message?: string } | null;
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: Failure }> };

function client(): RpcClient {
  const value = getSupabase();
  if (!value) throw new BusinessEffortUnavailableError();
  return value as unknown as RpcClient;
}

function identity(actor: BusinessEffortActor) {
  return { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail.trim().toLowerCase() };
}

/** Map the SQL boundary's named failures. Anything else, including a missing
 *  migration or unreachable database, is unavailable storage, never empty data. */
export function businessEffortFailure(error: Failure): void {
  if (!error) return;
  const detail = `${error.code ?? ""} ${error.message ?? ""}`;
  if (detail.includes("business_effort_access_denied") || detail.includes("platform_operator_read_access_denied")) throw new BusinessEffortAccessError();
  if (detail.includes("business_effort_invalid")) throw new BusinessEffortValidationError();
  if (detail.includes("business_effort_business_not_found")) throw new BusinessEffortNotFoundError("That customer business was not found.");
  if (detail.includes("business_effort_entry_not_found")) throw new BusinessEffortNotFoundError("That entry was not found.");
  if (detail.includes("business_effort_conflict")) throw new BusinessEffortConflictError();
  throw new BusinessEffortUnavailableError();
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  let result: { data: unknown; error: Failure };
  try {
    result = await client().rpc(name, args);
  } catch (error) {
    if (error instanceof BusinessEffortUnavailableError) throw error;
    throw new BusinessEffortUnavailableError();
  }
  businessEffortFailure(result.error);
  return result.data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BusinessEffortUnavailableError("Human-minute records could not be read.");
  return parsed.data;
}

export const PostgresBusinessEffortStore: BusinessEffortStore = {
  async record(actor, input): Promise<BusinessEffortEntry> {
    return parse(businessEffortEntrySchema, await rpc(input.queue ? "record_operator_queue_effort" : "record_business_effort", {
      ...identity(actor), p_entry_id: input.entryId, p_business_id: input.businessId, p_minutes: input.minutes,
      p_category: input.category, p_occurred_on: input.occurredOn, p_note: input.note ?? null,
      ...(input.queue ? { p_queue: input.queue } : {}),
    }));
  },
  async void(actor, input): Promise<BusinessEffortEntry> {
    return parse(businessEffortEntrySchema, await rpc("void_business_effort", {
      ...identity(actor), p_entry_id: input.entryId, p_reason: input.reason,
    }));
  },
  async listBusinesses(actor): Promise<EffortBusiness[]> {
    return parse(z.array(effortBusinessSchema), await rpc("read_audited_platform_operator_source", { ...identity(actor), p_reader_name: "read_effort_businesses" }));
  },
  async listEntries(actor, query): Promise<BusinessEffortEntry[]> {
    return parse(z.array(businessEffortEntrySchema), await rpc("read_audited_platform_operator_detail", {
      p_reader_name: "read_business_effort",
      ...identity(actor), p_from: query.from, p_business_id: query.businessId ?? null,
    }));
  },
};
