import { describe, expect, it } from "vitest";
import {
  MAX_JOB_ECONOMICS_CENTS,
  JobEconomicsValidationError,
  parseJobEconomicsCommand,
} from "@/platform/work-economics";

const workspaceRef = {
  action: "create" as const,
  productId: "tracker" as const,
  resourceKind: "tracker" as const,
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workId: "22222222-2222-4222-8222-222222222222",
  estimateCents: null,
  maxAuthorizedCents: MAX_JOB_ECONOMICS_CENTS,
};

describe("work economics command boundary", () => {
  it("defaults the payer to the authenticated actor and keeps unknown estimates null", () => {
    const parsed = parseJobEconomicsCommand(workspaceRef);
    if (parsed.action !== "create") throw new Error("expected create command");
    expect(parsed.estimateCents).toBeNull();
    expect(parsed.payerId).toBeUndefined();
  });

  it("rejects estimates above the explicit authorization", () => {
    expect(() => parseJobEconomicsCommand({
      ...workspaceRef,
      estimateCents: 501,
      maxAuthorizedCents: 500,
    })).toThrow("The estimate cannot exceed the authorized maximum.");
  });

  it("allows an unknown operator report only as a null amount", () => {
    expect(parseJobEconomicsCommand({
      action: "report_usage",
      jobId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "retry-1",
      kind: "model",
      attribution: "strelva_retry",
      amountCents: null,
    })).toMatchObject({ amountCents: null, attribution: "strelva_retry" });
    expect(() => parseJobEconomicsCommand({
      action: "report_usage",
      jobId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "retry-1",
      kind: "model",
      attribution: "strelva_retry",
      amountCents: -1,
    })).toThrow(JobEconomicsValidationError);
  });

  it("requires a stable key for retry-safe reservations and rejects metadata", () => {
    expect(() => parseJobEconomicsCommand({
      action: "reserve",
      jobId: "22222222-2222-4222-8222-222222222222",
      amountCents: 100,
    })).toThrow(JobEconomicsValidationError);
    expect(() => parseJobEconomicsCommand({
      ...workspaceRef,
      metadata: { source: "provider" },
    })).toThrow(JobEconomicsValidationError);
  });
});
