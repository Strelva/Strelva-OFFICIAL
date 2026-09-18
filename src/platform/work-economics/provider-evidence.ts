import { z } from "zod";
import { MAX_JOB_ECONOMICS_CENTS } from "./types";
import type {
  BudgetExecutionEvidenceContext,
  BudgetExecutionEvidenceResolver,
  BudgetExecutionReconciliation,
} from "./runtime";

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
  billableCents: z.number().int().min(0).max(MAX_JOB_ECONOMICS_CENTS),
  /** Opaque provider/billing evidence reference. It must not contain a secret. */
  evidenceReference: z.string().trim().min(1).max(256),
}).strict();
export type TrustedProviderReceipt = z.infer<typeof trustedProviderReceiptSchema>;

export type ProviderEvidenceFailureCode =
  | "provider_billing_unavailable"
  | "provider_receipt_missing"
  | "provider_receipt_timeout"
  | "provider_receipt_invalid"
  | "provider_receipt_mismatch"
  | "provider_receipt_read_failed";

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
  if (!receipt.requestId.trim() || !receipt.evidenceReference.trim()) {
    throw new ProviderEvidenceUnavailableError(
      "provider_receipt_missing",
      "The provider billing receipt has no immutable request reference.",
      { retryable: true },
    );
  }
  if (receipt.billableCents > context.maximumCents) {
    throw new ProviderEvidenceMismatchError(
      "The provider billed more than the admitted maximum.",
    );
  }
  return {
    effect: "accepted",
    amountCents: receipt.billableCents,
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
  if (!providerValue || typeof providerValue !== "object" || Array.isArray(providerValue)) return null;
  const billing = (providerValue as Record<string, unknown>).billing;
  if (!billing || typeof billing !== "object" || Array.isArray(billing)) return null;
  const candidate = billing as Record<string, unknown>;
  const requestId = candidate.requestId;
  const billableCents = candidate.billableCents;
  const evidenceReference = candidate.evidenceReference;
  if (typeof requestId !== "string" || typeof billableCents !== "number" || typeof evidenceReference !== "string") return null;
  return trustedProviderReceiptSchema.parse({
    version: 1,
    provider,
    requestId,
    executionKey: context.executionKey,
    kind: context.kind,
    attribution: context.attribution,
    maximumCents: context.maximumCents,
    billableCents,
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
