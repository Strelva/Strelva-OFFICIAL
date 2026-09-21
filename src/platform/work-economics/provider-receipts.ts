import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { mapBudgetExecution } from "./repository";
import type { BudgetExecution, BudgetExecutionEvidenceContext } from "./runtime";
import { settleWorkAllowanceExecution } from "./allowances-service";
import {
  ProviderEvidenceMismatchError,
  ProviderEvidenceUnavailableError,
  assertTrustedProviderReceiptMatchesContext,
  reconciliationFromTrustedProviderReceipt,
  trustedProviderReceiptSchema,
  type TrustedProviderReceipt,
} from "./provider-evidence";

type ProviderReceiptDatabase = { public: {
  Tables: Record<string, never>;
  Views: Record<string, never>;
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
  Functions: {
    record_work_provider_receipt: { Args: { p_receipt: unknown }; Returns: unknown };
    record_work_provider_receipt_decimal: { Args: { p_receipt: unknown }; Returns: unknown };
  };
} };

const UUID = z.string().uuid();
const receiptResult = z.object({
  receiptId: UUID,
  replayed: z.boolean(),
  execution: z.unknown(),
}).strict();

function client(): SupabaseClient<ProviderReceiptDatabase> {
  const value = getSupabase();
  if (!value) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_read_failed",
      "Provider billing evidence storage is not configured.",
      { retryable: true },
    );
  }
  return value as unknown as SupabaseClient<ProviderReceiptDatabase>;
}

function detail(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as { message?: unknown; details?: unknown; code?: unknown };
  return [value.message, value.details, value.code]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
}

function mapReceiptError(error: unknown): never {
  const message = detail(error);
  if (message.includes("provider_receipt_mismatch")) {
    throw new ProviderEvidenceMismatchError("The provider receipt does not match the admitted execution.");
  }
  if (message.includes("provider_receipt_target_not_started")) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_read_failed",
      "The provider receipt arrived before the execution was started.",
      { cause: error, retryable: false },
    );
  }
  if (message.includes("provider_receipt_target_not_found")) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_read_failed",
      "The provider receipt refers to an execution that no longer exists.",
      { cause: error, retryable: false },
    );
  }
  if (message.includes("provider_receipt_invalid")) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_invalid",
      "The provider returned an invalid billing receipt.",
      { cause: error, retryable: false },
    );
  }
  if (message.includes("provider_receipt_conflict")) {
    throw new ProviderEvidenceMismatchError("The provider request was already bound to different execution evidence.");
  }
  if (message.includes("provider_receipt_identity_denied")) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_read_failed",
      "The provider receipt could not be bound to a verified execution identity.",
      { cause: error, retryable: false },
    );
  }
  throw new ProviderEvidenceUnavailableError(
    "provider_receipt_read_failed",
    "Provider billing evidence could not be recorded.",
    { cause: error, retryable: true },
  );
}

export interface RecordedProviderReceipt {
  receiptId: string;
  replayed: boolean;
  execution: BudgetExecution;
}

/**
 * Persist a complete provider receipt and reconcile the exact held execution.
 * The provider receipt supplies the request id and exact amount; the database
 * binds those facts to the admitted job, execution key, cap, kind and
 * attribution before settling anything.
 */
export async function recordTrustedProviderReceipt(
  context: BudgetExecutionEvidenceContext,
  value: unknown,
): Promise<RecordedProviderReceipt> {
  const parsed = trustedProviderReceiptSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_invalid",
      "The provider returned no complete trusted billing receipt.",
      { retryable: false },
    );
  }

  const receipt: TrustedProviderReceipt = parsed.data;
  assertTrustedProviderReceiptMatchesContext(context, receipt);
  const receiptPayload = {
    provider: receipt.provider,
    requestId: receipt.requestId,
    jobId: context.jobId,
    executionKey: receipt.executionKey,
    kind: receipt.kind,
    attribution: receipt.attribution,
    maximumCents: receipt.maximumCents,
    evidenceReference: receipt.evidenceReference,
    ...(receipt.billableUsd !== undefined
      ? { billableUsd: receipt.billableUsd }
      : { billableCents: reconciliationFromTrustedProviderReceipt(context, receipt).amountCents }),
  };
  const result = await client().rpc(
    receipt.billableUsd !== undefined ? "record_work_provider_receipt_decimal" : "record_work_provider_receipt",
    { p_receipt: receiptPayload },
  );
  if (result.error) mapReceiptError(result.error);
  const parsedResult = receiptResult.safeParse(result.data);
  if (!parsedResult.success) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_read_failed",
      "Provider billing evidence returned an invalid execution receipt.",
      { retryable: true },
    );
  }
  // The provider RPC closes the held job execution and records the receipt in
  // one transaction. Customer allowance accounting is a separate existing
  // ledger, so settle it only after that durable receipt is committed. A
  // replay reaches this same branch and repairs a previously interrupted
  // allowance projection without repeating the provider action.
  await settleWorkAllowanceExecution(context.actor, {
    jobId: context.jobId,
    executionKey: context.executionKey,
  });

  return {
    receiptId: parsedResult.data.receiptId,
    replayed: parsedResult.data.replayed,
    execution: mapBudgetExecution(parsedResult.data.execution),
  };
}
