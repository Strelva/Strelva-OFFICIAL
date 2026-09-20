import { createHash } from "node:crypto";
import { websiteLaunchReceiptSchema, type WebsiteArtifact, type WebsiteLaunchReceipt } from "./contracts";
import { assertWebsiteArtifactBundle, buildWebsiteArtifact, websiteRendererDigest, type WebsiteArtifactBundle } from "./artifact";
import { canonicalJson, draftFromWebsiteSpec, type WebsiteGenerationProvider } from "./generation";
import { websiteSpecContentHash } from "./generation";

export type WebsiteLaunchTarget =
  | { kind: "local_export"; outputDirectory: string }
  | { kind: "github_vercel"; repositoryUrl: string; projectId: string; branch?: string };

export interface WebsiteLaunchPreparation {
  status: "prepared" | "blocked";
  provider: "local_export" | "github_vercel";
  artifactHash: string;
  artifactDigest: string;
  candidateRevision: number;
  files: WebsiteArtifactBundle["files"];
  receiptId: string | null;
  providerUrl?: string;
  reason?: "provider_unavailable" | "approval_required" | "artifact_mismatch" | "idempotency_conflict";
  evidence: string;
}

export interface WebsiteLaunchApproval {
  candidateRevision: number;
  contentHash: string;
}

export interface WebsiteLaunchAdapterOptions {
  target: WebsiteLaunchTarget;
  approval?: WebsiteLaunchApproval;
  now?: () => string;
}

export class WebsiteLaunchPreparationError extends Error {
  readonly reason: NonNullable<WebsiteLaunchPreparation["reason"]>;

  constructor(result: WebsiteLaunchPreparation) {
    super(result.evidence);
    this.name = "WebsiteLaunchPreparationError";
    this.reason = result.reason ?? "provider_unavailable";
  }
}

function receiptId(idempotencyKey: string, contentHash: string): string {
  return `website-launch-${createHash("sha256").update(`${idempotencyKey}:${contentHash}`, "utf8").digest("hex").slice(0, 32)}`;
}

function configuredTarget(target: WebsiteLaunchTarget): boolean {
  if (target.kind === "local_export") return Boolean(target.outputDirectory.trim());
  return /^https:\/\//i.test(target.repositoryUrl) && Boolean(target.projectId.trim());
}

function checkArtifact(bundle: WebsiteArtifactBundle): string | null {
  try {
    assertWebsiteArtifactBundle(bundle);
  } catch {
    return "artifact_mismatch";
  }
  if (bundle.candidate.contentHash !== bundle.contentHash) return "artifact_mismatch";
  if (bundle.candidate.revision !== bundle.revision) return "artifact_mismatch";
  if (bundle.candidate.rendererDigest !== bundle.rendererDigest || bundle.rendererDigest !== websiteRendererDigest()) return "artifact_mismatch";
  if (bundle.candidate.artifactDigest !== bundle.artifactDigest) return "artifact_mismatch";
  if (websiteSpecContentHash(bundle.spec) !== bundle.contentHash) return "artifact_mismatch";
  if (websiteSpecContentHash(bundle.candidate.spec) !== bundle.contentHash) return "artifact_mismatch";
  if (canonicalJson(bundle.candidate.spec) !== canonicalJson(bundle.spec)) return "artifact_mismatch";
  return null;
}

/**
 * Prepare a local export or an explicitly identified provider target. This
 * function only verifies and packages the immutable artifact. It never calls
 * GitHub, Vercel, a model, or any other external provider.
 */
export function prepareWebsiteLaunch(
  bundle: WebsiteArtifactBundle,
  target: WebsiteLaunchTarget,
  options: { approval?: WebsiteLaunchApproval; idempotencyKey?: string; now?: string } = {},
): WebsiteLaunchPreparation {
  const artifactError = checkArtifact(bundle);
  if (artifactError) {
    return {
      status: "blocked", provider: target.kind, artifactHash: bundle.contentHash, artifactDigest: bundle.artifactDigest,
      candidateRevision: bundle.revision, files: bundle.files, receiptId: null, reason: "artifact_mismatch",
      evidence: "The launch request did not match the immutable candidate artifact.",
    };
  }
  if (!configuredTarget(target)) {
    return {
      status: "blocked", provider: target.kind, artifactHash: bundle.contentHash, artifactDigest: bundle.artifactDigest,
      candidateRevision: bundle.revision, files: bundle.files, receiptId: null, reason: "provider_unavailable",
      evidence: target.kind === "local_export" ? "Choose a local export directory before preparing the bundle." : "A repository URL and Vercel project identity are required; no provider write was attempted.",
    };
  }
  if (target.kind === "github_vercel" && (!options.approval || options.approval.candidateRevision !== bundle.revision || options.approval.contentHash !== bundle.contentHash)) {
    return {
      status: "blocked", provider: target.kind, artifactHash: bundle.contentHash, artifactDigest: bundle.artifactDigest,
      candidateRevision: bundle.revision, files: bundle.files, receiptId: null, reason: "approval_required",
      evidence: "An exact approved candidate revision and content hash are required before provider launch preparation.",
    };
  }
  const key = options.idempotencyKey ?? `website:${bundle.workId}:candidate:${bundle.revision}`;
  return {
    status: "prepared", provider: target.kind, artifactHash: bundle.contentHash, artifactDigest: bundle.artifactDigest,
    candidateRevision: bundle.revision, files: bundle.files, receiptId: receiptId(key, bundle.contentHash),
    ...(target.kind === "github_vercel" ? { providerUrl: `https://vercel.com/${encodeURIComponent(target.projectId)}` } : {}),
    evidence: target.kind === "local_export"
      ? "The exact artifact bundle is ready for a local build. No external deployment was attempted."
      : "The exact approved artifact bundle is prepared for the identified repository and Vercel project. No provider write was attempted.",
  };
}

/** Convert a prepared provider result into the persisted pending receipt. */
export function pendingWebsiteLaunchReceipt(result: WebsiteLaunchPreparation, now = new Date().toISOString()): WebsiteLaunchReceipt {
  if (result.status !== "prepared" || result.provider !== "github_vercel" || !result.receiptId || !result.providerUrl) {
    throw new Error("Only a prepared provider target can produce a pending launch receipt.");
  }
  return websiteLaunchReceiptSchema.parse({
    status: "pending",
    receiptId: result.receiptId,
    provider: "github_vercel",
    providerUrl: result.providerUrl,
    evidence: result.evidence,
    artifactHash: result.artifactHash,
    candidateRevision: result.candidateRevision,
    preparedAt: new Date(now).toISOString(),
  });
}

/**
 * Adapter shape consumed by the durable website service. It regenerates the
 * export from the persisted spec, checks the candidate hash, and returns one
 * idempotent pending receipt. It does not claim that a provider accepted or
 * published anything.
 */
export function createWebsiteLaunchAdapter(options: WebsiteLaunchAdapterOptions) {
  const receipts = new Map<string, WebsiteLaunchReceipt>();
  return {
    async prepare(candidate: WebsiteArtifact, input: { workId: string; workspaceId: string; idempotencyKey: string }): Promise<WebsiteLaunchReceipt> {
      const cached = receipts.get(input.idempotencyKey);
      if (cached) {
        if (cached.artifactHash !== candidate.contentHash || cached.candidateRevision !== candidate.revision) throw new Error("The launch idempotency key is already bound to another website artifact.");
        return cached;
      }
      const expectedHash = websiteSpecContentHash(candidate.spec);
      if (expectedHash !== candidate.contentHash) throw new Error("The launch candidate content hash does not match its spec.");
      const draft = draftFromWebsiteSpec(candidate.spec, {
        businessName: candidate.spec.siteName,
        description: String((candidate.spec.content as Record<string, unknown>).settings && ((candidate.spec.content as Record<string, unknown>).settings as Record<string, unknown>).siteTagline || candidate.spec.siteName),
        primaryCallToAction: "Contact us",
      });
      const bundle = buildWebsiteArtifact({ workspaceId: input.workspaceId, workId: input.workId, revision: candidate.revision, draft, generatedAt: candidate.generatedAt, previewHref: candidate.preview.href });
      if (bundle.contentHash !== candidate.contentHash) throw new Error("The regenerated website artifact does not match the approved candidate.");
      if (bundle.rendererDigest !== candidate.rendererDigest) throw new Error("The website renderer changed after approval; regenerate the candidate before launch.");
      if (bundle.artifactDigest !== candidate.artifactDigest) throw new Error("The website export changed after approval; regenerate the candidate before launch.");
      const prepared = prepareWebsiteLaunch(bundle, options.target, { approval: options.approval, idempotencyKey: input.idempotencyKey, now: options.now?.() });
      if (prepared.status !== "prepared") throw new WebsiteLaunchPreparationError(prepared);
      const receipt = pendingWebsiteLaunchReceipt(prepared, options.now?.());
      receipts.set(input.idempotencyKey, receipt);
      return receipt;
    },
  };
}

export type WebsiteLaunchAdapter = ReturnType<typeof createWebsiteLaunchAdapter>;
export type { WebsiteGenerationProvider };
