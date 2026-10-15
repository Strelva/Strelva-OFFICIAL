/**
 * Site editor publish. In Postgres the sections, their version rows, the page
 * layout and the cleared drafts commit in one RPC, so a publish is either
 * fully live or not at all. The dev-file path (production cannot reach it)
 * writes section by section and puts the prior content back on failure, the
 * way restoreSiteSnapshot does.
 */

import { randomUUID } from "crypto";
import type { ContentMap, ContentSection, SitePageConfig } from "../types";
import {
  getStoredContent,
  operatorContentReceiptsEnabled,
  SECTION_TO_TYPE,
  setContent,
  settleContentReceipt,
} from "./content-store";
import { invalidateCachedContent, invalidateCachedPageConfig, setCachedContent, setCachedPageConfig } from "./content-cache";
import { clearDraft } from "./draft-store";
import { clearDraftPageConfig, getPageConfig, setPageConfig } from "./page-config-store";
import { appendVersion, observeTenantContentVersion } from "./version-store";
import { publishSiteDraftsAtomic } from "@/platform/infra/db/repositories";
import { contentSourceIsPostgres, dataSourceIsPostgres } from "@/platform/infra/db/source-flags";

export interface PublishDraftSection {
  section: ContentSection;
  data: ContentMap[ContentSection];
  changes: { field: string; before: string; after: string }[];
}

export interface PublishSiteDraftsInput {
  tenant: string;
  sections: PublishDraftSection[];
  pageConfig: SitePageConfig | null;
  author: "user" | "admin";
}

export interface PublishSiteDraftsResult {
  versionIds: Partial<Record<ContentSection, string>>;
}

export class SitePublishError extends Error {
  constructor(
    message: string,
    readonly rolledBack: boolean,
    readonly sectionsNeedingAttention: string[] = [],
  ) {
    super(message);
    this.name = "SitePublishError";
  }
}

export async function publishSiteDrafts(input: PublishSiteDraftsInput): Promise<PublishSiteDraftsResult> {
  const { tenant, sections, pageConfig, author } = input;
  if (sections.length === 0 && !pageConfig) return { versionIds: {} };

  const versionIds: Partial<Record<ContentSection, string>> = {};
  for (const s of sections) versionIds[s.section] = `v_${randomUUID()}`;

  if (contentSourceIsPostgres() && dataSourceIsPostgres()) {
    return publishInPostgres(input, versionIds);
  }

  // Dev-file or mixed sources: compensating rollback.
  const prior = new Map<ContentSection, ContentMap[ContentSection] | null>();
  const written: ContentSection[] = [];
  let pageWritten = false;
  const priorPage = pageConfig ? await getPageConfig(tenant) : null;
  try {
    for (const s of sections) prior.set(s.section, await getStoredContent(s.section, tenant));
    for (const s of sections) {
      await setContent(s.section, s.data as never, tenant);
      written.push(s.section);
      await appendVersion(s.section, s.data, author, tenant, s.changes);
    }
    if (pageConfig) {
      await setPageConfig(pageConfig, tenant);
      pageWritten = true;
    }
  } catch (err) {
    console.error("[publish] write failed; putting prior content back", err);
    const needsAttention: string[] = [];
    for (const section of written) {
      const before = prior.get(section) ?? null;
      if (!before) {
        needsAttention.push(section);
        continue;
      }
      try {
        await setContent(section, before as never, tenant);
      } catch (restoreErr) {
        console.error("[publish] could not put back", section, restoreErr);
        needsAttention.push(section);
      }
    }
    if (pageWritten && priorPage) {
      try {
        await setPageConfig(priorPage, tenant);
      } catch (restoreErr) {
        console.error("[publish] could not put back page layout", restoreErr);
        needsAttention.push("page layout");
      }
    }
    throw new SitePublishError(
      needsAttention.length ? "Publish failed and some sections could not be put back." : "Nothing was published. Try again.",
      needsAttention.length === 0,
      needsAttention,
    );
  }

  // A lingering draft is harmless: republishing is idempotent.
  for (const s of sections) {
    try {
      await clearDraft(s.section, tenant);
    } catch (err) {
      console.error("[publish] draft not cleared", s.section, err);
    }
  }
  if (pageConfig) {
    try {
      await clearDraftPageConfig(tenant);
    } catch (err) {
      console.error("[publish] page layout draft not cleared", err);
    }
  }
  return { versionIds };
}

async function publishInPostgres(
  input: PublishSiteDraftsInput,
  versionIds: Partial<Record<ContentSection, string>>,
): Promise<PublishSiteDraftsResult> {
  const { tenant, sections, pageConfig, author } = input;
  const withReceipts = operatorContentReceiptsEnabled();
  let receipts: Record<string, string | null>;
  try {
    receipts = await publishSiteDraftsAtomic(
      tenant,
      sections.map((s) => ({
        section: s.section,
        contentKey: SECTION_TO_TYPE[s.section],
        data: s.data as unknown as Record<string, unknown>,
        versionId: versionIds[s.section] as string,
        changes: s.changes.length ? s.changes : null,
      })),
      pageConfig as unknown as Record<string, unknown> | null,
      author,
      withReceipts,
    );
  } catch (err) {
    console.error("[publish] transaction rejected", err);
    for (const s of sections) await invalidateCachedContent(s.section, tenant).catch(() => {});
    await invalidateCachedPageConfig(tenant).catch(() => {});
    throw new SitePublishError("Nothing was published. Try again.", true);
  }

  // Committed. Everything below is best effort and must never throw.
  for (const s of sections) {
    try {
      if (withReceipts) {
        await settleContentReceipt(s.section, tenant, s.data as never, receipts[s.section] ?? null);
      } else {
        try {
          await setCachedContent(s.section, tenant, s.data as never);
        } catch {
          await invalidateCachedContent(s.section, tenant);
        }
      }
    } catch (err) {
      console.error("[publish] post-commit cache step failed", s.section, err);
    }
  }
  if (pageConfig) {
    try {
      await setCachedPageConfig(tenant, pageConfig);
    } catch {
      await invalidateCachedPageConfig(tenant).catch(() => {});
    }
  }
  for (const s of sections) {
    try {
      await observeTenantContentVersion(tenant, versionIds[s.section] as string);
    } catch (err) {
      console.error("[publish] System revision not observed", s.section, err);
    }
  }
  return { versionIds };
}
