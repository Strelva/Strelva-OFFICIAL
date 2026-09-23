import { z } from "zod";
import { MAX_JOB_ECONOMICS_CENTS } from "./types";
import type {
  BudgetExecutionEvidenceContext,
  BudgetExecutionEvidenceResolver,
  BudgetExecutionReconciliation,
} from "./execution-contracts";

/**
 * A provider receipt is deliberately stricter than model usage. Token counts,
 * model names, SDK response ids and a local rate card are useful diagnostics,
 * but none of them is a billable dollar amount. This shape is reserved for a
 * provider or billing gateway that returns an immutable request id together
 * with the exact amount it billed for that request.
 */
export const trustedProviderReceiptSchema = z.object({
  version: z.literal(1),
  provider: z.string().trim().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  requestId: z.string().trim().min(1).max(256),
  executionKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  kind: z.enum(["provider", "model", "tool", "human"]),
  attribution: z.enum(["normal", "strelva_retry"]),
  maximumCents: z.number().int().min(0).max(MAX_JOB_ECONOMICS_CENTS),
  /**
   * The existing ledger settles whole cents. A gateway may report a decimal
   * dollar amount instead. Keep that value as a string so the conversion below
   * never goes through binary floating point or silently rounds a fraction of a
   * cent.
   */
  billableCents: z.number().int().min(0).max(MAX_JOB_ECONOMICS_CENTS).optional(),
  billableUsd: z.string().trim().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(32).optional(),
  /** Opaque provider/billing evidence reference. It must not contain a secret. */
  evidenceReference: z.string().trim().min(1).max(256),
}).strict().superRefine((value, context) => {
  if ((value.billableCents === undefined) === (value.billableUsd === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Supply exactly one billable amount." });
  }
});
export type TrustedProviderReceipt = z.infer<typeof trustedProviderReceiptSchema>;

export type ProviderEvidenceFailureCode =
  | "provider_billing_unavailable"
  | "provider_receipt_missing"
  | "provider_receipt_timeout"
  | "provider_receipt_invalid"
  | "provider_receipt_mismatch"
  | "provider_receipt_read_failed"
  | "provider_receipt_precision_unresolved";

/**
 * This is an actionable exception, not a settlement. Callers must leave the
 * execution's maximum held and must not retry the provider action.
 */
export class ProviderEvidenceUnavailableError extends Error {
  readonly code: ProviderEvidenceFailureCode;
  readonly retryable: boolean;

  constructor(
    code: ProviderEvidenceFailureCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, options);
    this.name = "ProviderEvidenceUnavailableError";
    this.code = code;
    this.retryable = options?.retryable ?? true;
  }
}

export class ProviderEvidenceMismatchError extends ProviderEvidenceUnavailableError {
  constructor(message: string) {
    super("provider_receipt_mismatch", message, { retryable: false });
    this.name = "ProviderEvidenceMismatchError";
  }
}

/**
 * The provider supplied a real decimal amount, but the shared ledger cannot
 * represent it without rounding. Keep the execution held until an exact-cent
 * receipt or a ledger with finer precision is selected.
 */
export class ProviderEvidencePrecisionError extends ProviderEvidenceUnavailableError {
  constructor(message = "The provider bill is a fraction of a cent and cannot be represented by the current cent ledger.") {
    super("provider_receipt_precision_unresolved", message, { retryable: false });
    this.name = "ProviderEvidencePrecisionError";
  }
}

/** Convert a decimal dollar string to cents only when the conversion is exact. */
function exactCentsFromUsd(value: string): number {
  const normalized = value.trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(normalized);
  if (!match) throw new ProviderEvidencePrecisionError("The provider bill is not a valid decimal dollar amount.");
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  if (!Number.isSafeInteger(whole) || whole > Math.floor(MAX_JOB_ECONOMICS_CENTS / 100)) {
    throw new ProviderEvidencePrecisionError("The provider bill is outside the supported ledger range.");
  }
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new ProviderEvidencePrecisionError();
  }
  const cents = whole * 100 + Number(fraction.slice(0, 2).padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_JOB_ECONOMICS_CENTS) {
    throw new ProviderEvidencePrecisionError("The provider bill is outside the supported ledger range.");
  }
  return cents;
}

function billableCentsFromReceipt(receipt: TrustedProviderReceipt): number {
  return receipt.billableCents ?? exactCentsFromUsd(receipt.billableUsd!);
}

/** Validate provider identity and the decimal amount before durable storage. */
export function assertTrustedProviderReceiptMatchesContext(
  context: BudgetExecutionEvidenceContext,
  value: unknown,
): TrustedProviderReceipt {
  const parsed = trustedProviderReceiptSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_invalid",
      "The provider returned no complete trusted billing receipt.",
      { retryable: false },
    );
  }
  const receipt = parsed.data;
  if (receipt.executionKey !== context.executionKey
    || receipt.kind !== context.kind
    || receipt.attribution !== context.attribution
    || receipt.maximumCents !== context.maximumCents) {
    throw new ProviderEvidenceMismatchError(
      "The provider billing receipt does not match this exact execution.",
    );
  }
  if (receipt.billableUsd !== undefined) {
    const amount = Number(receipt.billableUsd);
    if (!Number.isFinite(amount) || amount < 0 || amount > context.maximumCents / 100) {
      throw new ProviderEvidenceMismatchError(
        "The provider billed more than the admitted maximum.",
      );
    }
  }
  return receipt;
}

/** A read-only server-side source for a durable provider/billing receipt. */
export interface ProviderEvidenceReader {
  /**
   * Read existing evidence only. Implementations must never call the model or
   * repeat the provider action while looking for a receipt.
   */
  read(context: BudgetExecutionEvidenceContext): Promise<TrustedProviderReceipt | null>;
}

/**
 * Bind a provider receipt to the exact admitted execution before the generic
 * runtime applies it. A receipt for another key, cap, kind or attribution is
 * rejected and remains unresolved rather than being applied to this job.
 */
export function reconciliationFromTrustedProviderReceipt(
  context: BudgetExecutionEvidenceContext,
  value: unknown,
): BudgetExecutionReconciliation {
  const receipt = assertTrustedProviderReceiptMatchesContext(context, value);
  if (!receipt.requestId.trim() || !receipt.evidenceReference.trim()) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_missing",
      "The provider billing receipt has no immutable request reference.",
      { retryable: true },
    );
  }
  const billableCents = billableCentsFromReceipt(receipt);
  if (billableCents > context.maximumCents) {
    throw new ProviderEvidenceMismatchError(
      "The provider billed more than the admitted maximum.",
    );
  }
  return {
    effect: "accepted",
    amountCents: billableCents,
    evidenceReference: receipt.evidenceReference,
  };
}

/**
 * Construct the generic runtime resolver from a read-only durable evidence
 * source. Missing, timed-out and malformed evidence never become zero.
 */
export function createProviderEvidenceResolver(reader: ProviderEvidenceReader): BudgetExecutionEvidenceResolver {
  return {
    async resolve(context) {
      let receipt: TrustedProviderReceipt | null;
      try {
        receipt = await reader.read(context);
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const timeout = message.includes("timeout") || message.includes("timed out");
        throw new ProviderEvidenceUnavailableError(
          timeout ? "provider_receipt_timeout" : "provider_receipt_read_failed",
          timeout
            ? "The provider billing record did not respond. The execution remains held; retry evidence lookup later."
            : "The provider billing record could not be read. The execution remains held; retry evidence lookup later.",
          { cause: error, retryable: true },
        );
      }
      if (!receipt) {
        throw new ProviderEvidenceUnavailableError(
          "provider_receipt_missing",
          "No trusted provider billing receipt is available yet. The execution remains held and the provider action will not be retried.",
          { retryable: true },
        );
      }
      return reconciliationFromTrustedProviderReceipt(context, receipt);
    },
  };
}

/**
 * AI SDK's standard result exposes usage and model metadata, but no standard
 * billable-dollar field. A future billing gateway may add a provider-specific
 * `billing` object to provider metadata. We accept it only when it contains
 * every required field; usageMetadata alone is intentionally unresolved.
 */
export function trustedReceiptFromAiSdkResult(
  result: unknown,
  context: BudgetExecutionEvidenceContext,
  provider: string,
): TrustedProviderReceipt | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const value = result as Record<string, unknown>;
  const metadata = value.providerMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const providerMetadata = metadata as Record<string, unknown>;
  const providerValue = providerMetadata[provider]
    ?? providerMetadata[provider.split("/")[0]!]
    ?? providerMetadata[provider.split(".")[0]!];
  if (!providerValue || typeof providerValue !== "object" || Array.isArray(providerValue)) {
    return vercelGatewayReceiptFromAiSdkResult(result, context);
  }
  const billing = (providerValue as Record<string, unknown>).billing;
  if (billing && typeof billing === "object" && !Array.isArray(billing)) {
    const candidate = billing as Record<string, unknown>;
    const requestId = candidate.requestId;
    const billableCents = candidate.billableCents;
    const billableUsd = candidate.billableUsd;
    const evidenceReference = candidate.evidenceReference;
    if (typeof requestId !== "string" || typeof evidenceReference !== "string") return null;
    if (typeof billableCents !== "number" && typeof billableUsd !== "string") return null;
    return trustedProviderReceiptSchema.parse({
      version: 1,
      provider,
      requestId,
      executionKey: context.executionKey,
      kind: context.kind,
      attribution: context.attribution,
      maximumCents: context.maximumCents,
      ...(typeof billableCents === "number" ? { billableCents } : { billableUsd }),
      evidenceReference,
    });
  }

  return vercelGatewayReceiptFromAiSdkResult(result, context);
}

/**
 * Vercel AI Gateway exposes the exact request cost in
 * `providerMetadata.gateway.cost`. The value is in dollars and can be a
 * fraction of a cent. A response/request id is required before the metadata
 * can become a durable receipt; a cost alone is only an observation.
 */
export function vercelGatewayReceiptFromAiSdkResult(
  result: unknown,
  context: BudgetExecutionEvidenceContext,
): TrustedProviderReceipt | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const value = result as Record<string, unknown>;
  const metadata = value.providerMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const gateway = (metadata as Record<string, unknown>).gateway;
  if (!gateway || typeof gateway !== "object" || Array.isArray(gateway)) return null;
  const candidate = gateway as Record<string, unknown>;
  const cost = candidate.cost;
  const requestId = candidate.requestId
    ?? candidate.request_id
    ?? (value.response && typeof value.response === "object" && !Array.isArray(value.response)
      ? (value.response as Record<string, unknown>).id
      : undefined);
  if ((typeof cost !== "number" && typeof cost !== "string") || typeof requestId !== "string" || !requestId.trim()) return null;
  const decimalCost = typeof cost === "number"
    ? Number.isFinite(cost) && cost >= 0 ? String(cost) : null
    : cost.trim();
  if (!decimalCost) return null;
  const evidenceReference = typeof candidate.evidenceReference === "string" && candidate.evidenceReference.trim()
    ? candidate.evidenceReference
    : `vercel-ai-gateway:${requestId}`;
  return trustedProviderReceiptSchema.parse({
    version: 1,
    provider: "vercel-ai-gateway",
    requestId,
    executionKey: context.executionKey,
    kind: context.kind,
    attribution: context.attribution,
    maximumCents: context.maximumCents,
    billableUsd: decimalCost,
    evidenceReference,
  });
}

/** The current Gemini adapter exposes token usage, not a billable receipt. */
export function geminiReceiptFromAiSdkResult(
  result: unknown,
  context: BudgetExecutionEvidenceContext,
): TrustedProviderReceipt | null {
  return trustedReceiptFromAiSdkResult(result, context, "google.generative-ai");
}
