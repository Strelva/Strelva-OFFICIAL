import { afterEach, expect, it, vi } from "vitest";
import { sandboxProofAdmissionSchema, parseProviderProofAdmission, requireProviderProofAdmission } from "../../tests/support/provider-harness-admission";
import { journeyProfile, preflight } from "../../scripts/full-model-journey-profile.mjs";
const now = Date.parse("2026-10-08T23:00:00Z");
const id = "27417000-0000-4000-8000-000000000001";
const admission = { schemaVersion: 1, environment: "nonproduction", authorizationReference: "Fictional schema test only",
  approvedBy: "Fictional schema validator", approvedAt: "2026-10-08T22:00:00Z", expiresAt: "2026-10-08T23:30:00Z",
  appOrigin: "http://localhost:50354", ownerAuthStatePath: "/owned-proof/fictional-auth.json", workspaceId: id, ownerUserId: id,
  ownerEmail: "fictional@example.test", kind: "sandbox-application", actions: ["build-one-candidate", "read-native-evidence"],
  workId: id, candidateVersion: 1, candidateRevision: 0, sourceDigest: "a".repeat(64), budgetJobId: id, maximumCents: 1,
  teamId: "fictional", projectId: "fictional", image: `fictional/image@sha256:${"b".repeat(64)}`,
  runtimeQualificationId: id, policyVersion: "fictional-v1", runtimePolicyReference: "Fictional schema only", memoryContractReference: "Fictional schema only",
  payerAcceptanceReference: "Fictional schema only", exactBillingResolverReference: "Fictional schema only" };
afterEach(() => vi.unstubAllEnvs());
it("a valid nonproduction input shape never releases the held provider profile", () => {
  expect(parseProviderProofAdmission(sandboxProofAdmissionSchema, admission, now)).toMatchObject({ kind: "sandbox-application" });
  expect(() => preflight(journeyProfile("full-provider"), process.cwd())).toThrow("Provider/client actions remain held");
});
it.each([
  { environment: "production" }, { appOrigin: "https://production.example" }, { actions: ["build-one-candidate", "publish"] },
  { expiresAt: "2026-10-08T22:30:00Z" }, { approvedAt: "2026-10-09T00:00:00Z" }, { maximumCents: 0 },
  { maximumCents: 1_000_001 }, { exactBillingResolverReference: "" }, { image: "fictional/latest" },
])("refuses unsafe, unbounded or incomplete proof inputs %j", mutation => {
  expect(() => parseProviderProofAdmission(sandboxProofAdmissionSchema, { ...admission, ...mutation }, now)).toThrow();
});
it("missing explicit authorization fails before loading a session or provider file, with no skip", () => {
  vi.stubEnv("STRELVA_AUTHORIZED_PROVIDER_PROOF", undefined);
  vi.stubEnv("STRELVA_PROVIDER_PROOF_ADMISSION", "/must-not-be-read.json");
  expect(() => requireProviderProofAdmission("sandbox-application", sandboxProofAdmissionSchema)).toThrow("Provider proof held");
});
