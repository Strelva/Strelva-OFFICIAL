import { websiteRebuildSchema, type WebsiteRebuild } from "./rebuild-contracts";

/**
 * What a saved website rebuild offers as a Possibility of the site it
 * rebuilds. Read from the stored rebuild payload on the server; the browser
 * receives only this summary, never the payload.
 *
 * A published rebuild is the site itself now, and a failed one is not an
 * alternative anyone can open, so neither is a candidate.
 */
export interface WebsiteRebuildCandidate {
  workId: string;
  title: string;
  /** Bare hostname of the site it was rebuilt from, when built from a URL. */
  sourceHost: string | null;
  /** The managed tenant it is bound to publish to, when bound. */
  tenantId: string | null;
  /** A reviewed candidate exists: it can be compared and decided on. */
  ready: boolean;
  summary: string;
  /** Recorded evidence only: carried-over pages and the before/after site check. */
  evidence: string | null;
  /** Same-origin candidate rendering. */
  previewHref: string | null;
  candidateRevision: number | null;
  candidateContentHash: string | null;
  /** `agency_draft`: a change an agency prepared under its website draft
   * grant for a site that is already published. One change to one client's
   * System, presented as that website's Possibility. `agent_draft` uses the
   * selected business owner's connector authority and retains that actor's
   * native proposal history; it does not use an agency draft grant. */
  origin: "rebuild" | "agency_draft" | "agent_draft";
}

const PUBLISH_KINDS = new Set(["rebuild_published", "publish_reconciled"]);

/** The latest pending draft retains its actual source; earlier agency/owner
 * history stays intact when an agent later proposes another candidate. */
function pendingDraftOrigin(rebuild: WebsiteRebuild): "agency_draft" | "agent_draft" | null {
  let origin: "agency_draft" | "agent_draft" | null = null;
  for (const entry of rebuild.history) {
    if (PUBLISH_KINDS.has(entry.kind)) origin = null;
    else if (entry.kind === "agency_document_draft") origin = "agency_draft";
    else if (entry.kind === "agent_document_proposal") origin = "agent_draft";
  }
  return origin;
}

export function bareHostname(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function averageScore(snapshot: NonNullable<WebsiteRebuild["audit"]>["before"]): number | null {
  if (!snapshot.categories.length) return null;
  return Math.round(snapshot.categories.reduce((sum, category) => sum + category.score, 0) / snapshot.categories.length);
}

function evidence(rebuild: WebsiteRebuild): string | null {
  const parts: string[] = [];
  if (rebuild.pageMapping.length) {
    const carried = rebuild.pageMapping.filter((page) => page.carriedOver).length;
    parts.push(`${carried} of ${rebuild.pageMapping.length} public pages carried over.`);
  }
  if (rebuild.audit) {
    const before = averageScore(rebuild.audit.before);
    const after = averageScore(rebuild.audit.after);
    if (before !== null && after !== null) parts.push(`Site check ${before} before, ${after} rebuilt.`);
  }
  return parts.length ? parts.join(" ") : null;
}

export function websiteRebuildCandidate(work: { id: string; productId: string; resourceKind: string; title?: string | null; payload: unknown }): WebsiteRebuildCandidate | null {
  if (work.productId !== "websites" || work.resourceKind !== "website") return null;
  const parsed = websiteRebuildSchema.safeParse(work.payload);
  if (!parsed.success) return null;
  const rebuild = parsed.data;
  if (rebuild.status === "published" || rebuild.status === "failed") return null;
  const ready = Boolean(rebuild.candidate) && (rebuild.status === "review_ready" || rebuild.status === "approved");
  const draftOrigin = pendingDraftOrigin(rebuild);
  return {
    workId: work.id,
    title: work.title?.trim() || rebuild.title,
    sourceHost: "url" in rebuild.input ? bareHostname(rebuild.input.url) : null,
    tenantId: rebuild.tenantId,
    ready,
    summary: draftOrigin === "agent_draft"
      ? "A change prepared by your connected agent. Review the facts and approve it before publishing. The live site is unchanged."
      : draftOrigin === "agency_draft"
      ? "A change your agency prepared under its website draft grant. The live site is unchanged until it is approved and published."
      : "The same business, pages and facts, rebuilt on Strelva's website system.",
    evidence: evidence(rebuild),
    previewHref: rebuild.candidate?.previewHref ?? null,
    candidateRevision: rebuild.candidate?.revision ?? null,
    candidateContentHash: rebuild.candidate?.contentHash ?? null,
    origin: draftOrigin ?? "rebuild",
  };
}
