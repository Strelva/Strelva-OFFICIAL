import { createHash } from "node:crypto";
import { boundedStore, type BoundedStore } from "@/platform/bounded-work/repository";
import { listWork } from "@/platform/workspaces/repository";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  type SavedWork,
  type WorkspaceActor,
} from "@/platform/workspaces/types";
import {
  approveWebsiteInputSchema,
  connectWebsiteCapabilitiesInputSchema,
  createWebsiteInputSchema,
  prepareWebsiteLaunchInputSchema,
  reviseWebsiteInputSchema,
  WEBSITE_PRODUCT_ID,
  WEBSITE_RESOURCE_KIND,
  websiteArtifactSchema,
  websiteLaunchReceiptSchema,
  websiteSchema,
  type ApproveWebsiteInput,
  type ConnectWebsiteCapabilitiesInput,
  type CreateWebsiteInput,
  type PrepareWebsiteLaunchInput,
  type ReviseWebsiteInput,
  type Website,
  type WebsiteArtifact,
  type WebsiteBrief,
  type WebsiteCapabilityOptions,
  type WebsiteLaunchReceipt,
  type WebsitePublishedCapabilities,
  type WebsiteRecord,
} from "./contracts";
import { buildWebsiteArtifact } from "./artifact";
import { draftFromWebsiteSpec, generateWebsiteDraft, websiteSpecContentHash } from "./generation";
import { listPublishedWebsiteCapabilityOptions, resolvePublishedWebsiteCapabilities } from "./published-capabilities";

export {
  WebsiteCandidateMismatchError,
  exportWebsiteCandidate,
  renderWebsiteCandidate,
} from "./preview";

export {
  approveWebsiteInputSchema,
  createWebsiteInputSchema,
  prepareWebsiteLaunchInputSchema,
  reviseWebsiteInputSchema,
  WEBSITE_PRODUCT_ID,
  WEBSITE_RESOURCE_KIND,
  websiteArtifactSchema,
  websiteLaunchReceiptSchema,
  websiteSchema,
} from "./contracts";

export class WebsiteConflictError extends WorkspaceConflictError {
  constructor(message = "This website changed. Reload it before continuing.") {
    super(message);
    this.name = "WebsiteConflictError";
  }
}

export class WebsiteUnavailableError extends WorkspaceStoreError {
  constructor(message = "This website is unavailable.") {
    super(message);
    this.name = "WebsiteUnavailableError";
  }
}

export class WebsiteProviderUnavailableError extends WebsiteUnavailableError {
  constructor(message = "Website artifact generation is not configured in this environment.") {
    super(message);
    this.name = "WebsiteProviderUnavailableError";
  }
}

export interface WebsiteArtifactGenerationInput {
  workspaceId: string;
  workId: string;
  revision: number;
  brief: WebsiteBrief;
  /** Resolved by the server from an active published capability grant. */
  publishedCapabilities?: WebsitePublishedCapabilities;
}

export interface WebsiteLaunchPreparationInput {
  workspaceId: string;
  workId: string;
  candidate: WebsiteArtifact;
  idempotencyKey: string;
}

/**
 * The website product owns the durable brief and lifecycle. A provider owns
 * artifact construction and any real launch handoff. The default provider
 * creates a deterministic local candidate; launch remains unavailable until
 * an authorized external artifact adapter is configured.
 */
export interface WebsiteArtifactProvider {
  generate(input: WebsiteArtifactGenerationInput): Promise<WebsiteArtifact>;
  prepareLaunch(input: WebsiteLaunchPreparationInput): Promise<WebsiteLaunchReceipt>;
}

interface WebsiteStore extends BoundedStore {
  list?: (actor: WorkspaceActor, workspaceId: string) => Promise<SavedWork[]>;
}

interface WebsiteServiceDependencies {
  provider?: WebsiteArtifactProvider;
  /** Never read from the customer brief or browser request. */
  resolvePublishedCapabilities?: (actor: WorkspaceActor, workspaceId: string, workId: string, selection?: Website["publishedCapabilitySelection"]) => Promise<WebsitePublishedCapabilities | undefined>;
  listPublishedCapabilityOptions?: (actor: WorkspaceActor, workspaceId: string, workId: string) => Promise<WebsiteCapabilityOptions>;
  findByRequest?: (actor: WorkspaceActor, workspaceId: string, requestId: string) => Promise<SavedWork | null>;
  list?: (actor: WorkspaceActor, workspaceId: string) => Promise<SavedWork[]>;
  now?: () => string;
}

interface LoadedWebsite {
  work: SavedWork;
  website: Website;
}

export const defaultWebsiteArtifactProvider: WebsiteArtifactProvider = {
  async generate(input) {
    const draft = await generateWebsiteDraft({
      workspaceId: input.workspaceId,
      workId: input.workId,
      revision: input.revision,
      brief: input.brief,
      publishedCapabilities: input.publishedCapabilities,
      now: new Date().toISOString(),
      previewHref: `/workspace?view=websites&work=${encodeURIComponent(input.workId)}&revision=${input.revision}`,
    });
    const bundle = buildWebsiteArtifact({
      workspaceId: input.workspaceId,
      workId: input.workId,
      revision: input.revision,
      draft,
      generatedAt: new Date().toISOString(),
      previewHref: `/workspace?view=websites&work=${encodeURIComponent(input.workId)}&revision=${input.revision}`,
    });
    return websiteArtifactSchema.parse({
      ...bundle.candidate,
      preview: {
        ...bundle.candidate.preview,
        href: `/api/websites/${encodeURIComponent(input.workId)}/preview?revision=${input.revision}&contentHash=${bundle.candidate.contentHash}`,
      },
    });
  },
  async prepareLaunch(input) {
    // Local preparation is deliberately limited to rebuilding the exact
    // immutable export. It does not call a model, GitHub, Vercel, or any other
    // external provider, and therefore returns a pending local receipt rather
    // than claiming publication.
    if (websiteSpecContentHash(input.candidate.spec) !== input.candidate.contentHash) {
      throw new WebsiteProviderUnavailableError("The approved website candidate no longer matches its content hash.");
    }
    const settings = input.candidate.spec.content.settings;
    const siteSettings = settings && typeof settings === "object" && !Array.isArray(settings)
      ? settings as Record<string, unknown>
      : {};
    const description = typeof siteSettings.siteTagline === "string" && siteSettings.siteTagline.trim()
      ? siteSettings.siteTagline
      : input.candidate.spec.siteName;
    const draft = draftFromWebsiteSpec(input.candidate.spec, {
      businessName: input.candidate.spec.siteName,
      description,
      primaryCallToAction: "Contact us",
    });
    const bundle = buildWebsiteArtifact({
      workspaceId: input.workspaceId,
      workId: input.workId,
      revision: input.candidate.revision,
      draft,
      generatedAt: input.candidate.generatedAt,
      previewHref: input.candidate.preview.href,
    });
    if (bundle.contentHash !== input.candidate.contentHash || bundle.revision !== input.candidate.revision || bundle.artifactDigest !== input.candidate.artifactDigest) {
      throw new WebsiteProviderUnavailableError("The approved website export does not match its candidate revision.");
    }
    if (bundle.rendererDigest !== input.candidate.rendererDigest) {
      throw new WebsiteProviderUnavailableError("The website renderer changed after approval. Generate a new preview before preparing export.");
    }
    const receiptId = `website-local-export-${createHash("sha256").update(`${input.idempotencyKey}:${input.candidate.contentHash}`, "utf8").digest("hex").slice(0, 32)}`;
    return websiteLaunchReceiptSchema.parse({
      status: "pending",
      receiptId,
      provider: "local_export",
      providerUrl: `/api/websites/${encodeURIComponent(input.workId)}/export?revision=${input.candidate.revision}&contentHash=${input.candidate.contentHash}`,
      evidence: `The exact approved website export is ready for private download (artifact ${bundle.artifactDigest}). No external deployment was attempted.`,
      artifactHash: input.candidate.contentHash,
      candidateRevision: input.candidate.revision,
      preparedAt: new Date().toISOString(),
    });
  },
};

function inputRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requestHash(brief: WebsiteBrief): string {
  return createHash("sha256").update(JSON.stringify(brief), "utf8").digest("hex");
}

function nowIso(now: () => string): string {
  const value = now();
  return new Date(value).toISOString();
}

function emptyLaunch() {
  return { status: "not_requested" as const, candidateRevision: null, receipt: null, failure: null };
}

function mapWebsite(work: SavedWork): LoadedWebsite {
  if (work.productId !== WEBSITE_PRODUCT_ID || work.resourceKind !== WEBSITE_RESOURCE_KIND) throw new WorkspaceAccessError();
  const parsed = websiteSchema.safeParse(work.payload);
  if (!parsed.success) throw new WebsiteUnavailableError("This website record could not be read.");
  return { work, website: parsed.data };
}

function present(loaded: LoadedWebsite): WebsiteRecord {
  return {
    workId: loaded.work.id,
    workspaceId: loaded.work.workspaceId,
    website: loaded.website,
    createdAt: loaded.work.createdAt,
    updatedAt: loaded.work.updatedAt,
  };
}

function transition(
  current: Website,
  actor: WorkspaceActor,
  kind: Website["history"][number]["kind"],
  now: () => string,
  change: Partial<Website>,
  candidateRevision: number | null,
  note: string | null = null,
): Website {
  if (current.history.length >= 500) throw new WebsiteConflictError("This website has reached its history limit.");
  const revision = current.revision + 1;
  return websiteSchema.parse({
    ...structuredClone(current),
    ...change,
    revision,
    history: [
      ...current.history,
      { revision, kind, actorId: actor.userId, at: nowIso(now), candidateRevision, note },
    ],
  });
}

function providerFailure(error: unknown, stage: "artifact" | "launch"): string {
  if (error instanceof WebsiteProviderUnavailableError) return error.message;
  if (error instanceof WebsiteUnavailableError) return error.message;
  return stage === "artifact"
    ? "The website preview could not be generated. Retry this brief or try again later."
    : "The website launch provider could not confirm this request. Retry from the saved approval.";
}

function privatePreviewHref(workId: string, candidate: Pick<WebsiteArtifact, "revision" | "contentHash">): string {
  return `/api/websites/${encodeURIComponent(workId)}/preview?revision=${candidate.revision}&contentHash=${candidate.contentHash}`;
}

function bindPrivatePreview(workId: string, candidate: WebsiteArtifact): WebsiteArtifact {
  return websiteArtifactSchema.parse({
    ...candidate,
    preview: {
      ...candidate.preview,
      href: privatePreviewHref(workId, candidate),
      revision: candidate.revision,
      contentHash: candidate.contentHash,
    },
  });
}

function isSameBrief(work: SavedWork, brief: WebsiteBrief): boolean {
  const input = inputRecord(work.input);
  return input.requestHash === requestHash(brief);
}

function readRequestId(work: SavedWork): string | null {
  const value = inputRecord(work.input).requestId;
  return typeof value === "string" ? value : null;
}

async function defaultList(store: WebsiteStore, actor: WorkspaceActor, workspaceId: string, dependencies: WebsiteServiceDependencies): Promise<SavedWork[]> {
  if (dependencies.list) return dependencies.list(actor, workspaceId);
  if (store.list) return store.list(actor, workspaceId);
  if (store === boundedStore) return listWork(actor, workspaceId);
  return [];
}

async function defaultFindByRequest(store: WebsiteStore, actor: WorkspaceActor, workspaceId: string, requestId: string, dependencies: WebsiteServiceDependencies): Promise<SavedWork | null> {
  if (dependencies.findByRequest) return dependencies.findByRequest(actor, workspaceId, requestId);
  const works = await defaultList(store, actor, workspaceId, dependencies);
  return works.find(work => work.productId === WEBSITE_PRODUCT_ID && work.resourceKind === WEBSITE_RESOURCE_KIND && readRequestId(work) === requestId) ?? null;
}

function draftPayload(actor: WorkspaceActor, brief: WebsiteBrief, now: () => string): Website {
  const createdAt = nowIso(now);
  return websiteSchema.parse({
    version: 1,
    revision: 0,
    title: brief.businessName,
    brief,
    status: "draft",
    candidate: null,
    approvedCandidateRevision: null,
    launch: emptyLaunch(),
    lastError: null,
    createdBy: actor.userId,
    createdAt,
    history: [],
  });
}

export interface WebsiteService {
  create(actor: WorkspaceActor, workspaceId: string, raw: unknown): Promise<WebsiteRecord>;
  read(actor: WorkspaceActor, workId: string): Promise<WebsiteRecord>;
  list(actor: WorkspaceActor, workspaceId: string): Promise<WebsiteRecord[]>;
  revise(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord>;
  approve(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord>;
  prepareLaunch(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord>;
  capabilityOptions(actor: WorkspaceActor, workId: string): Promise<WebsiteCapabilityOptions>;
  connectCapabilities(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord>;
}

export function createWebsiteService(inputStore: BoundedStore = boundedStore, dependencies: WebsiteServiceDependencies = {}): WebsiteService {
  const store = inputStore as WebsiteStore;
  const provider = dependencies.provider ?? defaultWebsiteArtifactProvider;
  const now = dependencies.now ?? (() => new Date().toISOString());

  async function load(actor: WorkspaceActor, workId: string): Promise<LoadedWebsite> {
    const work = await store.read(actor, workId);
    if (!work) throw new WebsiteUnavailableError("This website is unavailable.");
    return mapWebsite(work);
  }

  async function update(actor: WorkspaceActor, loaded: LoadedWebsite, expectedRevision: number, website: Website): Promise<WebsiteRecord> {
    const next = await store.update(actor, loaded.work, expectedRevision, website);
    return present(mapWebsite(next));
  }

  async function generate(actor: WorkspaceActor, loaded: LoadedWebsite, briefOverride?: WebsiteBrief, selectionOverride?: Website["publishedCapabilitySelection"] | null): Promise<WebsiteRecord> {
    const brief = briefOverride ?? loaded.website.brief;
    const selection = selectionOverride === undefined
      ? loaded.website.publishedCapabilitySelection
      : selectionOverride ?? undefined;
    const candidateRevision = loaded.website.revision + 1;
    // Native capability resolution is an authorization/data boundary. If it
    // is unavailable, preserve the draft and surface that failure instead of
    // recording a provider failure that invites an inappropriate retry.
    const publishedCapabilities = dependencies.resolvePublishedCapabilities
      ? await dependencies.resolvePublishedCapabilities(actor, loaded.work.workspaceId, loaded.work.id, selection)
      : undefined;
    if (selection && !publishedCapabilities) throw new WebsiteProviderUnavailableError("The selected published website connection is no longer available. Reopen connections and choose an active option.");
    let candidate: WebsiteArtifact;
    try {
      const generated = websiteArtifactSchema.parse(await provider.generate({
        workspaceId: loaded.work.workspaceId,
        workId: loaded.work.id,
        revision: candidateRevision,
        brief,
        publishedCapabilities,
      }));
      if (generated.revision !== candidateRevision) throw new WebsiteProviderUnavailableError("The website provider returned a stale candidate.");
      candidate = bindPrivatePreview(loaded.work.id, generated);
    } catch (error) {
      const message = providerFailure(error, "artifact");
      const next = transition(loaded.website, actor, "candidate_failed", now, {
        title: brief.businessName,
        brief,
        status: "failed",
        candidate: null,
        approvedCandidateRevision: null,
        launch: emptyLaunch(),
        lastError: { stage: "artifact", message, at: nowIso(now) },
      }, null, message);
      return update(actor, loaded, loaded.website.revision, next);
    }
    const next = transition(loaded.website, actor, "candidate_generated", now, {
      title: brief.businessName,
      brief,
      status: "preview_ready",
      candidate,
      publishedCapabilitySelection: selection,
      approvedCandidateRevision: null,
      launch: emptyLaunch(),
      lastError: null,
    }, candidate.revision);
    return update(actor, loaded, loaded.website.revision, next);
  }

  async function capabilityOptions(actor: WorkspaceActor, workId: string): Promise<WebsiteCapabilityOptions> {
    const loaded = await load(actor, workId);
    return (dependencies.listPublishedCapabilityOptions ?? listPublishedWebsiteCapabilityOptions)(actor, loaded.work.workspaceId, loaded.work.id);
  }

  async function connectCapabilities(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord> {
    const input: ConnectWebsiteCapabilitiesInput = connectWebsiteCapabilitiesInputSchema.parse(raw);
    const loaded = await load(actor, workId);
    if (loaded.website.revision !== input.expectedRevision) throw new WebsiteConflictError();
    if (input.selection) {
      const options = await (dependencies.listPublishedCapabilityOptions ?? listPublishedWebsiteCapabilityOptions)(actor, loaded.work.workspaceId, loaded.work.id);
      const tenant = options.tenants.find((candidate) => candidate.tenantId === input.selection?.tenantId);
      const inquiryValid = !input.selection.inquiryCapabilityId || Boolean(tenant?.inquiry.some((candidate) => candidate.capabilityId === input.selection?.inquiryCapabilityId));
      const bookingValid = !input.selection.bookingGrantId || Boolean(tenant?.booking.some((candidate) => candidate.grantId === input.selection?.bookingGrantId));
      if (!tenant || !inquiryValid || !bookingValid) throw new WebsiteConflictError("That published connection is no longer available. Reload the available connections.");
    }
    return generate(actor, loaded, undefined, input.selection);
  }

  const requestIndex = new Map<string, string>();

  async function create(actor: WorkspaceActor, workspaceId: string, raw: unknown): Promise<WebsiteRecord> {
    const input: CreateWebsiteInput = createWebsiteInputSchema.parse(raw);
    // Idempotent replay still performs a write-shaped operation. Check direct
    // workspace membership before looking up an existing row so delegated
    // read access cannot turn this endpoint into a record-disclosure path.
    await store.member(actor, workspaceId);
    const indexKey = `${workspaceId}:${input.requestId}`;
    const indexedWorkId = requestIndex.get(indexKey);
    const indexed = indexedWorkId ? await store.read(actor, indexedWorkId) : null;
    const existing = indexed ?? await defaultFindByRequest(store, actor, workspaceId, input.requestId, dependencies);
    if (existing) {
      if (!isSameBrief(existing, input.brief)) throw new WebsiteConflictError("This request id already belongs to different website details.");
      requestIndex.set(indexKey, existing.id);
      return present(mapWebsite(existing));
    }
    const payload = draftPayload(actor, input.brief, now);
    let work: SavedWork;
    try {
      work = await store.create(actor, workspaceId, {
        productId: WEBSITE_PRODUCT_ID,
        resourceKind: WEBSITE_RESOURCE_KIND,
        title: payload.title,
        payload,
        input: { version: 1, source: "website_creation", requestId: input.requestId, requestHash: requestHash(input.brief) },
      });
    } catch (error) {
      // The production migration has a unique website request index. If a
      // concurrent caller won that insert, reload its row and preserve the
      // same idempotent response instead of creating a second work item.
      if (error instanceof WorkspaceStoreError) {
        const raced = await defaultFindByRequest(store, actor, workspaceId, input.requestId, dependencies);
        if (raced) {
          if (!isSameBrief(raced, input.brief)) throw new WebsiteConflictError("This request id already belongs to different website details.");
          requestIndex.set(indexKey, raced.id);
          return present(mapWebsite(raced));
        }
      }
      throw error;
    }
    requestIndex.set(indexKey, work.id);
    return generate(actor, mapWebsite(work));
  }

  async function read(actor: WorkspaceActor, workId: string): Promise<WebsiteRecord> {
    return present(await load(actor, workId));
  }

  async function list(actor: WorkspaceActor, workspaceId: string): Promise<WebsiteRecord[]> {
    const works = await defaultList(store, actor, workspaceId, dependencies);
    return works.filter(work => work.productId === WEBSITE_PRODUCT_ID && work.resourceKind === WEBSITE_RESOURCE_KIND).map(mapWebsite).map(present);
  }

  async function revise(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord> {
    const input: ReviseWebsiteInput = reviseWebsiteInputSchema.parse(raw);
    const loaded = await load(actor, workId);
    if (loaded.website.revision !== input.expectedRevision) throw new WebsiteConflictError();
    if (loaded.website.status === "launch_pending" && loaded.website.launch.receipt?.provider !== "local_export") {
      throw new WebsiteConflictError("Launch preparation is already in progress. Wait for its receipt or retry it.");
    }
    return generate(actor, loaded, input.brief);
  }

  async function approve(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord> {
    const input: ApproveWebsiteInput = approveWebsiteInputSchema.parse(raw);
    const loaded = await load(actor, workId);
    if (loaded.website.revision !== input.expectedRevision) throw new WebsiteConflictError();
    if (loaded.website.status !== "preview_ready" || !loaded.website.candidate) throw new WebsiteConflictError("Generate a current preview before approving this website.");
    if (loaded.website.candidate.revision !== input.candidateRevision || loaded.website.candidate.contentHash !== input.candidateContentHash) throw new WebsiteConflictError("Approve the current website preview, not an older revision or content hash.");
    const next = transition(loaded.website, actor, "approved", now, {
      status: "approved",
      approvedCandidateRevision: loaded.website.candidate.revision,
      lastError: null,
    }, loaded.website.candidate.revision);
    return update(actor, loaded, input.expectedRevision, next);
  }

  async function prepareLaunch(actor: WorkspaceActor, workId: string, raw: unknown): Promise<WebsiteRecord> {
    const input: PrepareWebsiteLaunchInput = prepareWebsiteLaunchInputSchema.parse(raw);
    const loaded = await load(actor, workId);
    if (loaded.website.revision !== input.expectedRevision) throw new WebsiteConflictError();
    if (!loaded.website.candidate || loaded.website.candidate.revision !== input.candidateRevision || loaded.website.candidate.contentHash !== input.candidateContentHash) throw new WebsiteConflictError("The requested website preview is no longer current.");
    if (loaded.website.status === "published" && loaded.website.launch.candidateRevision === input.candidateRevision) return present(loaded);
    if (loaded.website.status === "launch_pending" && loaded.website.launch.receipt?.candidateRevision === input.candidateRevision) return present(loaded);
    const canRetry = loaded.website.status === "failed" && loaded.website.lastError?.stage === "launch" && loaded.website.approvedCandidateRevision === input.candidateRevision;
    const canRecover = loaded.website.status === "launch_pending"
      && loaded.website.launch.candidateRevision === input.candidateRevision
      && loaded.website.launch.receipt === null;
    if (loaded.website.status !== "approved" && !canRetry && !canRecover) throw new WebsiteConflictError("Approve the current website preview before preparing launch.");

    const started = transition(loaded.website, actor, "launch_started", now, {
      status: "launch_pending",
      launch: { status: "pending", candidateRevision: input.candidateRevision, receipt: null, failure: null },
      lastError: null,
    }, input.candidateRevision);
    const reserved = mapWebsite(await store.update(actor, loaded.work, input.expectedRevision, started));
    const idempotencyKey = `website:${reserved.work.id}:candidate:${input.candidateRevision}`;
    let receipt: WebsiteLaunchReceipt;
    try {
      receipt = websiteLaunchReceiptSchema.parse(await provider.prepareLaunch({
        workspaceId: reserved.work.workspaceId,
        workId: reserved.work.id,
        candidate: reserved.website.candidate!,
        idempotencyKey,
      }));
      if (receipt.candidateRevision !== input.candidateRevision || receipt.artifactHash !== reserved.website.candidate!.contentHash) throw new WebsiteProviderUnavailableError("The website launch provider returned a receipt for another artifact.");
    } catch (error) {
      const message = providerFailure(error, "launch");
      const failed = transition(reserved.website, actor, "launch_failed", now, {
        status: "failed",
        launch: { status: "failed", candidateRevision: input.candidateRevision, receipt: null, failure: message },
        lastError: { stage: "launch", message, at: nowIso(now) },
      }, input.candidateRevision, message);
      return update(actor, reserved, reserved.website.revision, failed);
    }

    // Receipt persistence is outside the provider-failure catch. If an
    // external adapter accepted the idempotency key but this update fails, the
    // row remains launch_pending and the next call can reconcile with the same
    // key instead of recording a misleading retryable provider failure.
    const confirmed = transition(reserved.website, actor, receipt.status === "published" ? "launch_confirmed" : "launch_prepared", now, {
      status: receipt.status === "published" ? "published" : "launch_pending",
      launch: { status: receipt.status, candidateRevision: input.candidateRevision, receipt, failure: null },
      lastError: null,
    }, input.candidateRevision);
    return update(actor, reserved, reserved.website.revision, confirmed);
  }

  return { create, read, list, revise, approve, prepareLaunch, capabilityOptions, connectCapabilities };
}

export const websiteService = createWebsiteService(boundedStore, {
  resolvePublishedCapabilities: resolvePublishedWebsiteCapabilities,
});
export const createWebsite = (actor: WorkspaceActor, workspaceId: string, input: unknown) => websiteService.create(actor, workspaceId, input);
export const readWebsite = (actor: WorkspaceActor, workId: string) => websiteService.read(actor, workId);
export const listWebsites = (actor: WorkspaceActor, workspaceId: string) => websiteService.list(actor, workspaceId);
export const reviseWebsite = (actor: WorkspaceActor, workId: string, input: unknown) => websiteService.revise(actor, workId, input);
export const approveWebsite = (actor: WorkspaceActor, workId: string, input: unknown) => websiteService.approve(actor, workId, input);
export const prepareWebsiteLaunch = (actor: WorkspaceActor, workId: string, input: unknown) => websiteService.prepareLaunch(actor, workId, input);
export const listWebsiteCapabilityOptions = (actor: WorkspaceActor, workId: string) => websiteService.capabilityOptions(actor, workId);
export const connectWebsiteCapabilities = (actor: WorkspaceActor, workId: string, input: unknown) => websiteService.connectCapabilities(actor, workId, input);
