import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type SavedWork, type WorkspaceActor } from "@/platform/workspaces/types";
import { createLegacyArchiveCaptureService, legacyArchiveSqlSerialization, validateLegacyWebsiteArchive, type LegacyArchiveCapturePort, type LegacyWebsiteArchive } from "./legacy-archive";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const keySchema = z.object({ workspaceId: z.string().uuid(), workId: z.string().uuid() }).strict();
import { legacyArchiveSummarySchema } from "./legacy-archive-contracts";
export { legacyArchiveSummarySchema, type LegacyArchiveSummary } from "./legacy-archive-contracts";
export interface LegacyArchiveRpc { rpc(name: string, args: Record<string,unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>; }
export function createLegacyArchiveStore(db?: LegacyArchiveRpc) {
  const identity = (actor: WorkspaceActor, key: z.infer<typeof keySchema>) => {
    keySchema.parse(key);
    return { p_user_id: z.string().uuid().parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail), p_workspace_id: key.workspaceId, p_work_id: key.workId };
  };
  async function rpc(name: string, args: Record<string,unknown>) {
    const client = db ?? getSupabase() as unknown as LegacyArchiveRpc | null;
    if (!client) throw new WorkspaceStoreError("Legacy website archive storage is unavailable.");
    const result = await client.rpc(name,args);
    if (result.error) {
      if (/workspace_access_denied|legacy_archive_scope_denied/.test(result.error.message)) throw new WorkspaceAccessError();
      if (/legacy_archive_(source_conflict|capture_conflict)|workspace_exit_future_work_blocked/.test(result.error.message)) throw new WorkspaceConflictError("The source website or archive authority changed. Repeat the dry run before capture.");
      throw new WorkspaceStoreError("Legacy website archive storage could not be confirmed.");
    }
    return result.data;
  }
  const port: LegacyArchiveCapturePort = {
    async authorize(actor,key) { await rpc("authorize_website_legacy_archive",identity(actor,key)); },
    async readSource(actor,key) {
      const raw = await rpc("read_website_legacy_archive_source",identity(actor,key));
      const envelope = z.object({ source: z.record(z.string(),z.json()) }).strict().parse(raw);
      const source = envelope.source;
      if (source.id !== key.workId || source.workspaceId !== key.workspaceId || source.productId !== "websites" || source.resourceKind !== "website") throw new WorkspaceAccessError();
      // The RPC returns the reviewed SQL projection, with the same optional omission as getWork.
      return source as unknown as SavedWork;
    },
    async captureAtomically(actor,archive) {
      validateLegacyWebsiteArchive(archive);
      const raw = await rpc("capture_website_legacy_archive",{ ...identity(actor,{ workspaceId: archive.workspaceId, workId: archive.sourceWorkId }), p_archive: archive, p_evidence_json: legacyArchiveSqlSerialization(archive).evidenceJson });
      return z.object({ archive: z.unknown() }).strict().parse(raw).archive;
    },
  };
  return {
    ...createLegacyArchiveCaptureService(port),
    async list(actor: WorkspaceActor, key: z.infer<typeof keySchema>, afterArchiveId?: string) {
      const raw = await rpc("list_website_legacy_archives",{ ...identity(actor,key), p_after_archive_id: afterArchiveId === undefined ? null : hash.parse(afterArchiveId), p_limit: 50 });
      const result = z.object({ viewerWorkId: z.string().uuid(), workspaceId: z.string().uuid(), archives: z.array(legacyArchiveSummarySchema).max(50), nextCursor: hash.nullable() }).strict().parse(raw);
      if (result.viewerWorkId !== key.workId || result.workspaceId !== key.workspaceId || result.archives.some(row => row.workspaceId !== key.workspaceId)) throw new WorkspaceAccessError();
      return { archives: result.archives, nextCursor: result.nextCursor };
    },
    async read(actor: WorkspaceActor, key: z.infer<typeof keySchema>, archiveId: string): Promise<LegacyWebsiteArchive> {
      const raw = await rpc("read_website_legacy_archive",{ ...identity(actor,key), p_archive_id: hash.parse(archiveId) });
      const result = z.object({ viewerWorkId: z.string().uuid(), workspaceId: z.string().uuid(), archive: z.unknown() }).strict().parse(raw);
      const archive = validateLegacyWebsiteArchive(result.archive);
      if (result.viewerWorkId !== key.workId || result.workspaceId !== key.workspaceId || archive.workspaceId !== key.workspaceId || archive.archiveId !== archiveId) throw new WorkspaceAccessError();
      // SQL authorizes viewerWorkId=sourceWorkId OR exact same-workspace
      // saved_product_work.source_work_id lineage. Arbitrary cross-work linking
      // is never accepted from the request or inferred from returned UI text.
      return archive;
    },
  };
}
export const legacyArchiveStore = createLegacyArchiveStore();
