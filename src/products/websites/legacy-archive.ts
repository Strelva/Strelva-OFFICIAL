import { createHash } from "node:crypto";
import { z } from "zod";
import { websiteSchema, websiteArtifactSchema, type WebsiteRecord } from "./contracts";
import { assertWebsiteArtifactBundle, type WebsiteArtifactBundle } from "./artifact";
import { canonicalJson, websiteSpecContentHash } from "./generation";
import type { SavedWork, WorkspaceActor } from "@/platform/workspaces/types";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const keySchema = z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid() }).strict();
export const legacyArchiveSchema = z.object({
  kind: z.literal("website_legacy_archive"), schemaVersion: z.literal(1),
  archiveId: digest, workspaceId: z.string().uuid(), sourceWorkId: z.string().uuid(),
  sourceVersion: z.literal(1), sourceRevision: z.number().int().nonnegative(),
  sourceDigest: digest, evidenceDigest: digest, sourceJson: z.string().max(20_000_000),
  versions: z.array(z.object({
    kind: z.literal("legacy_candidate"), revision: z.number().int().positive(),
    availability: z.enum(["body_retained", "body_unresolved"]),
    candidateJson: z.string().max(10_000_000).nullable(), contentHash: digest.nullable(),
    bundleJson: z.string().max(100_000_000).nullable(), bundleDigest: digest.nullable(),
  }).strict()).max(503),
}).strict();
export type LegacyWebsiteArchive = z.infer<typeof legacyArchiveSchema>;
export class LegacyArchiveConflict extends Error {}
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
function postgresJsonDomain(value: unknown): void {
  if (typeof value === "number" && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) throw new LegacyArchiveConflict("The source contains a number outside the supported exact archive domain. Retain its original database/export bytes before migration.");
  if (typeof value === "string") {
    if (value.includes("\u0000")) throw new LegacyArchiveConflict("The source contains a NUL string unsupported by PostgreSQL JSONB.");
    for (let i=0;i<value.length;i++) {
      const code=value.charCodeAt(i);
      if (code>=0xD800 && code<=0xDBFF) { const next=value.charCodeAt(++i); if (!(next>=0xDC00 && next<=0xDFFF)) throw new LegacyArchiveConflict("The source contains an unpaired Unicode surrogate."); }
      else if (code>=0xDC00 && code<=0xDFFF) throw new LegacyArchiveConflict("The source contains an unpaired Unicode surrogate.");
    }
  }
  if (Array.isArray(value)) value.forEach(postgresJsonDomain);
  else if (value && typeof value === "object") for (const [key,entry] of Object.entries(value)) { postgresJsonDomain(key); postgresJsonDomain(entry); }
}
function json(value: unknown) {
  // Saved work is JSON, not a JS object that can silently lose undefined/functions.
  const checked = z.json().parse(value);
  postgresJsonDomain(checked);
  return canonicalJson(checked);
}
function identity(workspaceId: string, workId: string, sourceRevision: number, sourceDigest: string, evidenceDigest: string) {
  return hash(json({ kind: "website_legacy_archive", workspaceId, workId, sourceRevision, sourceDigest, evidenceDigest }));
}
/** Mirrors the actual getWork wire projection. Only known undefined optional
 * fields are omitted; undefined in nested payload/input is still refused. */
export function legacyArchiveSourceProjection(work: SavedWork) {
  const permitted = new Set(["id", "workspaceId", "productId", "resourceKind", "title", "payload", "input", "sourceWorkId", "createdBy", "createdAt", "updatedAt"]);
  if (Object.keys(work).some(field => !permitted.has(field))) throw new LegacyArchiveConflict("Unknown source fields require an archive projection update.");
  const projection = { ...work };
  for (const field of ["title", "input", "sourceWorkId"] as const) {
    if (projection[field] === undefined) delete projection[field];
  }
  z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), productId: z.literal("websites"), resourceKind: z.literal("website"), title: z.string().max(160).optional(), input: z.json().optional(), sourceWorkId: z.string().uuid().optional(), payload: z.json(), createdBy: z.string().uuid(), createdAt: z.string().datetime({offset:true}), updatedAt: z.string().datetime({offset:true}) }).strict().parse(projection);
  return projection;
}
function source(work: SavedWork, key: z.infer<typeof keySchema>) {
  keySchema.parse(key);
  if (work.id !== key.workId || work.workspaceId !== key.workspaceId || work.productId !== "websites" || work.resourceKind !== "website") throw new LegacyArchiveConflict("The source website scope does not match.");
  return websiteSchema.parse(work.payload);
}
/** Pure dry-run capture. No mutation, generation, approval or publication. */
export function captureLegacyWebsiteArchive(work: SavedWork, key: z.infer<typeof keySchema>, recovered: readonly WebsiteArtifactBundle[] = []): LegacyWebsiteArchive {
  const website = source(work, key);
  const sourceJson = json(legacyArchiveSourceProjection(work)); const sourceDigest = hash(sourceJson);
  const refs = new Set(website.history.flatMap(entry => entry.candidateRevision === null ? [] : [entry.candidateRevision]));
  if (website.candidate) refs.add(website.candidate.revision);
  if (website.approvedCandidateRevision !== null) refs.add(website.approvedCandidateRevision);
  if (website.launch.candidateRevision !== null) refs.add(website.launch.candidateRevision);
  const bodies = new Map<number, { candidateJson: string; contentHash: string; bundleJson: string | null; bundleDigest: string | null }>();
  if (website.candidate) {
    if (websiteSpecContentHash(website.candidate.spec) !== website.candidate.contentHash) throw new LegacyArchiveConflict("The current candidate hash does not match its retained body.");
    // Preserve original candidate JSON, including provider spec values.
    const raw = (work.payload as { candidate: unknown }).candidate;
    bodies.set(website.candidate.revision, { candidateJson: json(raw), contentHash: website.candidate.contentHash, bundleJson: null, bundleDigest: null });
  }
  if (recovered.length > 503) throw new LegacyArchiveConflict("Too many recovered artifacts.");
  for (const bundle of recovered) {
    assertWebsiteArtifactBundle(bundle);
    const paths = bundle.files.map(file => file.path);
    if (new Set(paths).size !== paths.length || paths.some(path => !/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === ".."))) throw new LegacyArchiveConflict("Recovered artifact has unsafe or duplicate file paths.");
    const manifestFile = bundle.files.find(file => file.path === "artifact-manifest.json");
    if (!manifestFile) throw new LegacyArchiveConflict("Recovered artifact manifest is missing.");
    const manifest = z.object({ version: z.literal(1), kind: z.literal("website_artifact"), workspaceId: z.string().uuid(), workId: z.string().uuid(), revision: z.number().int().positive(), contentHash: digest, rendererDigest: digest, artifactDigest: digest, rendererContractVersion: z.literal("v1"), files: z.literal("listed_by_path_in_this_export") }).strict().parse(JSON.parse(manifestFile.content));
    if (manifest.workspaceId !== bundle.workspaceId || manifest.workId !== bundle.workId || manifest.revision !== bundle.revision || manifest.contentHash !== bundle.contentHash || manifest.rendererDigest !== bundle.rendererDigest || manifest.artifactDigest !== bundle.artifactDigest) throw new LegacyArchiveConflict("Recovered artifact manifest does not match its pinned identity.");
    const candidate = websiteArtifactSchema.parse(bundle.candidate);
    if (bundle.workspaceId !== key.workspaceId || bundle.workId !== key.workId || bundle.revision !== candidate.revision || !refs.has(candidate.revision)) throw new LegacyArchiveConflict("Recovered artifact is not a referenced version of this website.");
    const retained = bodies.get(candidate.revision); const candidateJson = json(bundle.candidate);
    if (retained && retained.candidateJson !== candidateJson) throw new LegacyArchiveConflict("Recovered artifact conflicts with a retained candidate.");
    const bundleJson = json(bundle);
    if (Buffer.byteLength(bundleJson,"utf8") > 100_000_000) throw new LegacyArchiveConflict("Recovered artifact exceeds archive capacity.");
    if (retained?.bundleJson && retained.bundleJson !== bundleJson) throw new LegacyArchiveConflict("Recovered artifacts disagree for the same version.");
    bodies.set(candidate.revision, { candidateJson, contentHash: candidate.contentHash, bundleJson, bundleDigest: hash(bundleJson) });
  }
  const versions = [...refs].sort((a,b) => a-b).map(revision => ({ kind: "legacy_candidate" as const, revision, availability: bodies.has(revision) ? "body_retained" as const : "body_unresolved" as const, ...(bodies.get(revision) ?? { candidateJson: null, contentHash: null, bundleJson: null, bundleDigest: null }) }));
  const evidenceJson = json(versions);
  if (Buffer.byteLength(evidenceJson,"utf8") + Buffer.byteLength(sourceJson,"utf8") > 100_000_000) throw new LegacyArchiveConflict("Capture exceeds archive capacity. Retain its source externally before retrying.");
  const evidenceDigest = hash(evidenceJson);
  return legacyArchiveSchema.parse({ kind: "website_legacy_archive", schemaVersion: 1, archiveId: identity(key.workspaceId,key.workId,website.revision,sourceDigest,evidenceDigest), workspaceId: key.workspaceId, sourceWorkId: key.workId, sourceVersion: 1, sourceRevision: website.revision, sourceDigest, evidenceDigest, sourceJson, versions });
}
/** Revalidate the entire archive at every storage/read boundary. */
export function validateLegacyWebsiteArchive(raw: unknown): LegacyWebsiteArchive {
  const archive = legacyArchiveSchema.parse(raw);
  if (hash(archive.sourceJson) !== archive.sourceDigest) throw new LegacyArchiveConflict("Archived source digest does not match.");
  const work = JSON.parse(archive.sourceJson) as SavedWork;
  const bundles = archive.versions.flatMap(version => {
    if (version.bundleJson === null) { if (version.bundleDigest !== null) throw new LegacyArchiveConflict("Missing artifact body."); return []; }
    if (hash(version.bundleJson) !== version.bundleDigest) throw new LegacyArchiveConflict("Archived artifact digest does not match.");
    return [JSON.parse(version.bundleJson) as WebsiteArtifactBundle];
  });
  const rebuilt = captureLegacyWebsiteArchive(work, { workspaceId: archive.workspaceId, workId: archive.sourceWorkId }, bundles);
  if (json(rebuilt) !== json(archive)) throw new LegacyArchiveConflict("Archived version references or identity changed.");
  return archive;
}
/** Exact v1 wire projection; unresolved old versions cannot be selected/restored. */
export function legacyArchiveRecord(raw: unknown, selection?: { revision: number; contentHash: string }): WebsiteRecord {
  const archive = validateLegacyWebsiteArchive(raw);
  const work = JSON.parse(archive.sourceJson) as SavedWork;
  const website = websiteSchema.parse(work.payload);
  if (selection) {
    const version = archive.versions.find(item => item.revision === selection.revision);
    if (!version?.candidateJson || version.contentHash !== selection.contentHash) throw new LegacyArchiveConflict("This historical candidate body is unavailable or does not match.");
    // Selection changes this detached read projection only; original source is immutable.
    website.candidate = websiteArtifactSchema.parse(JSON.parse(version.candidateJson));
  }
  return { workspaceId: work.workspaceId, workId: work.id, website, createdAt: work.createdAt, updatedAt: work.updatedAt };
}
export interface LegacyArchiveCapturePort {
  /** Current direct website scope, rechecked even on replay. */
  authorize(actor: WorkspaceActor, key: z.infer<typeof keySchema>): Promise<void>;
  readSource(actor: WorkspaceActor, key: z.infer<typeof keySchema>): Promise<SavedWork>;
  /** Must atomically reauthorize, lock source and compare revision AND digest;
   * insert immutable archive+audit once, or return exact existing archive.
   * Must never overwrite source, approval, tenant, or native document. */
  captureAtomically(actor: WorkspaceActor, archive: LegacyWebsiteArchive): Promise<unknown>;
}
export function createLegacyArchiveCaptureService(port: LegacyArchiveCapturePort) {
  return {
    async dryRun(actor: WorkspaceActor, key: z.infer<typeof keySchema>, recovered: readonly WebsiteArtifactBundle[] = []) {
      keySchema.parse(key); await port.authorize(actor,key);
      return captureLegacyWebsiteArchive(await port.readSource(actor,key),key,recovered);
    },
    async commit(actor: WorkspaceActor, raw: unknown) {
      const archive = validateLegacyWebsiteArchive(raw);
      const key = { workspaceId: archive.workspaceId, workId: archive.sourceWorkId };
      await port.authorize(actor,key);
      const current = captureLegacyWebsiteArchive(await port.readSource(actor,key),key);
      if (current.sourceRevision !== archive.sourceRevision || current.sourceDigest !== archive.sourceDigest) throw new LegacyArchiveConflict("The source website changed after dry run. Capture its current state again.");
      const saved = validateLegacyWebsiteArchive(await port.captureAtomically(actor,archive));
      if (json(saved) !== json(archive)) throw new LegacyArchiveConflict("The archived capture could not be confirmed.");
      return saved;
    },
  };
}

/** Additive, read-only native Versions projection. A retained v1 body is not
 * an approved native document and never offers native restore/Make Real. */
export function legacyArchiveVersionEntries(raw: unknown) {
  const archive = validateLegacyWebsiteArchive(raw);
  return archive.versions.map(version => ({
    kind: "legacy_archive" as const, archiveId: archive.archiveId,
    workspaceId: archive.workspaceId, sourceWorkId: archive.sourceWorkId,
    sourceVersion: archive.sourceVersion, sourceRevision: archive.sourceRevision,
    sourceDigest: archive.sourceDigest, evidenceDigest: archive.evidenceDigest,
    candidateRevision: version.revision, contentHash: version.contentHash,
    availability: version.availability, restoreAllowed: false as const, publishAllowed: false as const,
  }));
}

/** Portable capture evidence; does not replace the existing v1 project export. */
export function legacyArchiveExportFiles(raw: unknown): Array<{ path: string; bytes: Buffer }> {
  const archive = validateLegacyWebsiteArchive(raw);
  return [
    { path: "legacy-archive.json", bytes: Buffer.from(json(archive)) },
    { path: "original-saved-work.json", bytes: Buffer.from(archive.sourceJson) },
    { path: "README.md", bytes: Buffer.from("# Retained legacy website\n\nThe original v1 saved work, receipts and history are unchanged. body_unresolved entries have no recovered candidate body and cannot be restored. This archive is read-only evidence, not an approved native document or publication. Recovered bundle files retain their renderer and manifest; existing v1 preview/export selectors remain authoritative until parity.\n") },
    ...archive.versions.flatMap(version => [
      ...(version.candidateJson ? [{ path: `versions/${version.revision}/candidate.json`, bytes: Buffer.from(version.candidateJson) }] : []),
      ...(version.bundleJson ? [{ path: `versions/${version.revision}/bundle.json`, bytes: Buffer.from(version.bundleJson) }] : []),
    ]),
  ];
}

/** Exact UTF8 text sent to SQL. SQL hashes these bytes and compares their
 * parsed JSON values to the locked row/envelope; it never reprints JSONB. */
export function legacyArchiveSqlSerialization(raw: unknown) {
  const archive = validateLegacyWebsiteArchive(raw);
  return { sourceJson: archive.sourceJson, evidenceJson: json(archive.versions), archive };
}
