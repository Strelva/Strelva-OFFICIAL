/**
 * The one service that puts tenant sections live. The content API, an approved
 * content_update event and the agent's auto-published update all publish here,
 * so what happens after a section is written (version, timestamp, activity,
 * audit, draft cleanup, revalidation, verification and read-back) has one
 * order and one place to change.
 *
 * Each caller states what is strict and what is best effort, because they keep
 * different promises today: the content API answers 500 if its activity log
 * fails, the event executor must not swallow a failed version write, and the
 * agent never turns a saved update into a failure. This is a refactor; those
 * promises are unchanged.
 *
 * `writeTenantSections` is the only place that calls setContent/setPageConfig
 * for these paths. It is the seam sites-integrity makes transactional.
 * TODO(sites-integrity): snapshot restore (site-snapshot-store.ts) and version
 * restore (version-store.ts restoreVersion) still write on their own.
 */
import {
  appendVersion,
  clearDraft,
  clearDraftPageConfig,
  getContent,
  logActivity,
  logAuditEvent,
  recordSectionUpdate,
  setContent,
  setPageConfig,
} from "@/lib/storage";
import { clientRevalidationTargetForSections } from "@/lib/content-revalidation";
import { workspacePorts } from "@/lib/workspace-ports";
import type { ContentMap, ContentSection, SitePageConfig } from "@/lib/types";
import type { ActorContext } from "@/platform/infra/auth";
import { diffFields } from "@/lib/utils";

type Mode = "strict" | "best_effort";
type FieldChange = ReturnType<typeof diffFields>[number];

export interface TenantSectionWrite {
  section: ContentSection;
  data: ContentMap[ContentSection];
  /** The live content before this write, when the caller already read it. */
  prior?: Record<string, unknown>;
  /** The caller's own diff, when it must differ from prior against data. */
  changes?: FieldChange[];
}

export interface PublishTenantSectionsInput {
  tenantId: string;
  writes: TenantSectionWrite[];
  pageConfig?: SitePageConfig | null;
  author: "user" | "admin" | "ai";
  /** Stored on the content version, so a caller that lost the response can find this write. */
  requestId?: string;
  /** Runs right after the live write. False: another caller already took this change, so nothing more happens. */
  afterWrite?: () => Promise<boolean>;
  /** appendVersion, and recordSectionUpdate unless `sectionTimestamp` is false. */
  versions: Mode;
  /** False when the caller stamps the section itself later. */
  sectionTimestamp?: boolean;
  activity?: { mode: Mode; text: (section: ContentSection) => string };
  audit?: { actor: ActorContext };
  clearDrafts: Mode | "none";
  clearDraftsAt?: "before_revalidation" | "after_revalidation";
  /** Runs after drafts are cleared and before verification and read-back. */
  onPublished?: () => void;
  /** Called with each failed client-site revalidation (fire-and-forget). */
  onRevalidateError?: (error: unknown) => void;
  verify?: boolean;
  readBack?: { actorId: string; publicationRef?: string };
  /** What a best-effort step logs before the error, so each caller's existing log line stays the same. */
  messages?: { versions?: (section: ContentSection) => unknown[]; clearDraft?: (sections: ContentSection[]) => unknown[] };
}

export type TenantPublishReceipt =
  | { status: "already_resolved" }
  | { status: "published"; sections: ContentSection[]; pageConfig: boolean; revalidation: Promise<unknown> };

const writeFailures = new WeakSet<object>();

/** True when the error came from the live write itself, not from what follows it. */
export function isSectionWriteFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && writeFailures.has(error);
}

/** The live write: each section in order, then the page layout. The seam for a transactional writer. */
export async function writeTenantSections(
  tenantId: string,
  writes: ReadonlyArray<{ section: ContentSection; data: ContentMap[ContentSection] }>,
  pageConfig: SitePageConfig | null,
): Promise<void> {
  try {
    for (const write of writes) await setContent(write.section, write.data as ContentMap[typeof write.section], tenantId);
    if (pageConfig) await setPageConfig(pageConfig, tenantId);
  } catch (error) {
    if (typeof error === "object" && error !== null) { writeFailures.add(error); throw error; }
    const wrapped = new Error(String(error));
    writeFailures.add(wrapped);
    throw wrapped;
  }
}

async function guard(mode: Mode, step: () => Promise<unknown>, logged?: unknown[]): Promise<void> {
  if (mode === "strict") { await step(); return; }
  try { await step(); } catch (error) { if (logged) console.error(...logged, error); }
}

export async function publishTenantSections(input: PublishTenantSectionsInput): Promise<TenantPublishReceipt> {
  const { tenantId, author } = input;
  const writes: Array<TenantSectionWrite & { prior: Record<string, unknown>; changes: FieldChange[] }> = [];
  for (const write of input.writes) {
    const prior = write.prior ?? (await getContent(write.section, tenantId) as unknown as Record<string, unknown>);
    writes.push({ ...write, prior, changes: write.changes ?? diffFields(prior, write.data as unknown as Record<string, unknown>) });
  }
  await writeTenantSections(tenantId, writes, input.pageConfig ?? null);
  if (input.afterWrite && !(await input.afterWrite())) return { status: "already_resolved" };

  const sections = writes.map(write => write.section);
  const pageConfig = Boolean(input.pageConfig);
  for (const write of writes) {
    await guard(input.versions, async () => {
      if (input.requestId) await appendVersion(write.section, write.data, author, tenantId, write.changes, input.requestId);
      else await appendVersion(write.section, write.data, author, tenantId, write.changes);
      if (input.sectionTimestamp !== false) await recordSectionUpdate(write.section, tenantId);
    }, input.messages?.versions?.(write.section));
    if (input.activity) {
      const { activity } = input;
      await guard(activity.mode, () => logActivity({
        text: activity.text(write.section), time: new Date().toISOString(), type: "admin", section: write.section,
        actor: author, changes: write.changes, snapshot: write.prior,
      }, tenantId));
    }
    if (input.audit) {
      await logAuditEvent({
        tenant: tenantId, actor: input.audit.actor, action: "content.published", targetType: "content_section", targetId: write.section,
        metadata: { section: write.section, changeCount: write.changes.length },
      });
    }
  }
  if (input.audit && input.pageConfig) {
    await logAuditEvent({
      tenant: tenantId, actor: input.audit.actor, action: "page_config.published", targetType: "page_config", targetId: tenantId,
      metadata: { pages: Object.keys(input.pageConfig) },
    });
  }

  const clear = async () => {
    if (input.clearDrafts === "none") return;
    await guard(input.clearDrafts, async () => {
      for (const write of writes) await clearDraft(write.section, tenantId);
      if (input.pageConfig) await clearDraftPageConfig(tenantId);
    }, input.messages?.clearDraft?.(sections));
  };
  const clearAt = input.clearDraftsAt ?? "before_revalidation";
  if (clearAt === "before_revalidation") await clear();

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/");
  const { revalidateClientSite } = await import("@/lib/revalidate-client");
  const revalidation = Promise.resolve(revalidateClientSite(tenantId, clientRevalidationTargetForSections(sections, { pageConfigChanged: pageConfig })))
    .catch(error => input.onRevalidateError?.(error));

  if (clearAt === "after_revalidation") await clear();
  input.onPublished?.();

  if (input.verify) {
    const { scheduleVerification } = await import("@/lib/verify-live");
    for (const write of writes) scheduleVerification(tenantId, write.section, write.data as unknown as Record<string, unknown>);
  }
  if (input.readBack) {
    for (const write of writes) {
      try {
        await (await workspacePorts().websitePublicationReadback()).observeAcceptedNativePublish({
          tenantId, section: write.section, expected: write.data, actorId: input.readBack.actorId, publicationRef: input.readBack.publicationRef, revalidation,
        });
      } catch { /* Public observation cannot turn an accepted publish into a failure. */ }
    }
  }
  return { status: "published", sections, pageConfig, revalidation };
}
