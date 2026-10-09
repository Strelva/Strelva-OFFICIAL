import { actorCopy, actorSentence } from "@/platform/presentation/actor";
/**
 * Possibilities in Postgres for the Systems experience (systems-experience
 * spec behavior 15). Server only.
 *
 * A saved website rebuild of a STORED website System (adopted at conversion,
 * so it has a current revision to pin) is kept as a stored Possibility,
 * `source_ref = website-rebuild:<workId>`: created once, refreshed when the
 * candidate or the site moved, rehearsed on isolated adapters and marked
 * Ready by the engine. Its one outside effect is the hosted website channel.
 * A site that is not stored yet keeps today's per-request projection.
 *
 * Writes need an owner or admin; a member's read uses what is stored. Any
 * failure leaves the per-request projection in place and claims nothing.
 */
import { randomUUID } from "node:crypto";
import { possibilityPreviewPath } from "@/platform/possibilities/preview-link";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import {
  createPossibility,
  possibilityInputSchema,
  markReady,
  returnToExploring,
  recordRehearsal,
  rehearsePossibility,
  reviseCandidate,
  type LiveSystemsReader,
  type Possibility,
  type PossibilityInput,
} from "@/platform/possibilities";
import type { ListedPossibility, SupabasePossibilityRepository } from "@/platform/possibilities/supabase-repository";
import type { Activation } from "@/platform/make-real/contracts";
import { createIsolatedAdapter } from "@/platform/make-real/isolated-adapters";
import { customerActivationView } from "@/platform/make-real/view";
import type { BusinessSystems, SystemListing } from "@/platform/systems/from-existing";
import type { SystemRevision } from "@/platform/systems/contracts";
import { siteDocumentSchema, unresolvedSiteFacts, type WebsiteRebuildCandidate, type WebsiteRebuildRecord } from "@/products/websites/index";
import { followUpTryView } from "@/products/inquiries/server";
import { publicBookingScheduleSchema } from "@/products/scheduling/contracts";
import type {
  WorkspaceSystemActivation,
  WorkspaceSystemHistoryRow,
  WorkspaceSystemPossibility,
  WorkspaceSystemReceipt,
} from "@/experience/workspace/contracts";

export const REBUILD_SOURCE_PREFIX = "website-rebuild:";

export function rebuildSourceRef(workId: string): string {
  return `${REBUILD_SOURCE_PREFIX}${workId}`;
}

export interface StoredTarget {
  candidate: WebsiteRebuildCandidate;
  site: SystemListing;
  /** Stored inquiry Systems fed by the site's contact form. */
  inquiries: SystemListing[];
  domain: string;
}

/** What a rebuild would change, pinned to what each stored System runs now. */
export function rebuildPossibilityInput(target: StoredTarget, revisions: ReadonlyMap<string, { revisionId: string; number: number }>): PossibilityInput | null {
  const { candidate, site, inquiries, domain } = target;
  const siteRevision = revisions.get(site.system.id);
  if (!siteRevision || !candidate.candidateRevision || !candidate.candidateContentHash) return null;
  const draft = candidate.origin !== "rebuild";
  const author = candidate.origin === "agent_draft" ? "connected agent" : "agency";
  const pinned = inquiries.filter((item) => revisions.has(item.system.id));
  return {
    title: draft ? `A proposed change to ${domain}` : `A rebuilt ${domain}`,
    intent: draft ? `Apply the ${author}'s proposed change to ${domain}.` : `Replace ${domain} with ${candidate.title}.`,
    changes: [
      { baseline: { businessId: site.system.businessId, systemId: site.system.id, ...siteRevision },
        candidate: { summary: draft ? `the ${author}'s change to ${domain}` : `the rebuilt ${domain}`, content: { website: domain, rebuildWorkId: candidate.workId, candidateRevision: candidate.candidateRevision, candidateContentHash: candidate.candidateContentHash } } },
      ...pinned.map((item) => ({
        baseline: { businessId: item.system.businessId, systemId: item.system.id, ...revisions.get(item.system.id)! },
        candidate: { summary: "inquiries from the rebuilt contact form", content: { form: `Rebuilt contact form on ${domain}`, rebuildWorkId: candidate.workId } },
      })),
    ],
    effects: [{
      id: "publish-site", kind: "publish", channel: "hosted_website", system: { systemId: site.system.id },
      description: `Publish the ${draft ? "changed" : "rebuilt"} ${domain}`,
      request: { workId: candidate.workId, candidateRevision: candidate.candidateRevision, candidateContentHash: candidate.candidateContentHash,
        ...(site.references.tenantId ? { tenantId: site.references.tenantId } : {}) },
      after: [],
    }],
    checks: [
      { id: "site-serves", description: `${domain} serves every carried-over page from the rebuilt site.` },
      ...(pinned.length ? [{ id: "form-delivers", description: "A test message from the rebuilt contact form arrives in Inquiries." }] : []),
    ],
  };
}

function sameCandidate(p: Possibility, input: PossibilityInput): boolean {
  const next = possibilityInputSchema.parse(input);
  return canonicalJson({ changes: p.changes, effects: p.effects, checks: p.checks }) === canonicalJson({ changes: next.changes, effects: next.effects, checks: next.checks });
}

/** Rehearse on isolated adapters and mark Ready when the rebuild is reviewed. */
async function prepare(p: Possibility, ready: boolean, deps: { repo: SupabasePossibilityRepository; live: LiveSystemsReader; actorId: string; at: string }): Promise<Possibility> {
  const rehearsal = await rehearsePossibility(p, deps.live, [createIsolatedAdapter("publish")], deps.at);
  const rehearsed = recordRehearsal(p, rehearsal, p.revision, deps.actorId, deps.at);
  await deps.repo.save(rehearsed, p.revision);
  if (!ready || !rehearsal.ok) return rehearsed;
  const marked = await markReady(rehearsed, deps.live, rehearsed.revision, deps.actorId, deps.at);
  await deps.repo.save(marked, rehearsed.revision);
  return marked;
}

/**
 * Create or refresh the stored Possibility for each target. Returns what is
 * stored afterwards. `canWrite: false` (a member) only reads.
 */
export async function syncRebuildPossibilities(deps: {
  repo: SupabasePossibilityRepository;
  live: LiveSystemsReader;
  businessId: string;
  targets: readonly StoredTarget[];
  revisions: ReadonlyMap<string, { revisionId: string; number: number }>;
  actorId: string;
  at: string;
  canWrite: boolean;
}): Promise<ListedPossibility[]> {
  let stored = await deps.repo.listWithSources(deps.businessId);
  if (!deps.canWrite) return stored;
  let wrote = false;
  for (const target of deps.targets) {
    const input = rebuildPossibilityInput(target, deps.revisions);
    if (!input) continue;
    const ref = rebuildSourceRef(target.candidate.workId);
    const existing = stored.find((row) => row.sourceRef === ref)?.possibility;
    try {
      if (!existing) {
        const created = await deps.repo.createFromSource(createPossibility(input, { id: randomUUID(), businessId: deps.businessId, actorId: deps.actorId, at: deps.at }), ref);
        if (!created.replayed) await prepare(created.possibility, target.candidate.ready, deps);
        wrote = true;
        continue;
      }
      if (existing.status === "made_real" || existing.status === "withdrawn" || existing.activationId) continue;
      if (!sameCandidate(existing, input)) {
        // The candidate or a pinned System moved: Strelva refreshes it and asks again.
        const revised = reviseCandidate(existing, { title: input.title, intent: input.intent, changes: input.changes, effects: input.effects, checks: input.checks }, existing.revision, deps.actorId, deps.at);
        await deps.repo.save(revised, existing.revision);
        await prepare(revised, target.candidate.ready, deps);
        wrote = true;
      } else if (existing.status === "exploring" && target.candidate.ready && !existing.rehearsal) {
        await prepare(existing, true, deps);
        wrote = true;
      }
    } catch (error) {
      if (error instanceof WorkspaceAccessError) break;
      // A concurrent writer or a moved pin: the next read settles it.
    }
  }
  if (wrote) stored = await deps.repo.listWithSources(deps.businessId);
  return stored;
}

/** Native Ask drafts keep their exact content/hash pin as the owner reviews copy. */
export async function syncAskPageSetPossibilities(deps: {
  repo: SupabasePossibilityRepository; live: LiveSystemsReader; actorId: string; at: string;
  stored: ListedPossibility[]; canWrite: boolean;
  read(workId: string): Promise<WebsiteRebuildRecord>;
}): Promise<ListedPossibility[]> {
  if (!deps.canWrite) return deps.stored;
  const rows = [...deps.stored];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    let p = row.possibility;
    const intro = [...p.introduces, ...p.changes].find(item => ["ask-website-pages", "ask-existing-booking-page", "ask-existing-website-pages"].includes(String(item.candidate.content.kind)));
    const workId = intro?.candidate.content.rebuildWorkId;
    if (!intro || typeof workId !== "string" || p.activationId || !["exploring", "ready"].includes(p.status)) continue;
    try {
      const record = await deps.read(workId);
      const candidate = record.rebuild.candidate;
      if (record.workspaceId !== p.businessId || !candidate || record.rebuild.status === "published") continue;
      const content: Record<string, unknown> = { ...intro.candidate.content, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash, document: candidate.document };
      if (canonicalJson(content) !== canonicalJson(intro.candidate.content)) {
        const revised = reviseCandidate(p, {
          introduces: p.introduces.map(item => item.candidate.content.rebuildWorkId === workId ? { ...item, candidate: { ...item.candidate, content } } : item),
          changes: p.changes.map(item => item.candidate.content.rebuildWorkId === workId ? { ...item, candidate: { ...item.candidate, content } } : item),
          effects: p.effects.map(effect => effect.channel === "hosted_website" && effect.request.workId === workId ? { ...effect, request: { workId, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash } } : effect),
        }, p.revision, deps.actorId, deps.at);
        await deps.repo.save(revised, p.revision);
        p = revised;
      }
      const checked = siteDocumentSchema.parse(candidate.document);
      const bookingSchedule = publicBookingScheduleSchema.safeParse(content.bookingSchedule);
      const bookingMatches = content.kind !== "ask-existing-booking-page" || bookingSchedule.success
        && checked.capabilities?.booking?.capabilityId === bookingSchedule.data.capabilityId
        && checked.capabilities.booking.version === bookingSchedule.data.version
        && record.rebuild.publishedCapabilitySelection?.bookingGrantId === content.grantId
        && checked.pages.some(page => page.path === content.bookingPath);
      const reviewed = ["review_ready", "approved"].includes(record.rebuild.status)
        && bookingMatches
        && unresolvedSiteFacts(checked).length === 0
        && Object.values(checked.nodes).every(node => !node.verification?.needsReview);
      if (p.status === "exploring" && reviewed) p = await prepare(p, true, deps);
      rows[index] = { ...row, possibility: p };
    } catch { /* Unreadable or concurrent candidates stay held for review. */ }
  }
  return rows;
}

function lastStale(p: Possibility): string | null {
  const last = [...p.history].reverse().find((h) => h.kind === "stale" || h.kind === "ready" || h.kind === "revise");
  return p.status === "exploring" && last?.kind === "stale" ? last.detail ?? "A System it changes moved since it was built." : null;
}

/** Open stored Possibilities as the browser reads them. Made real and withdrawn move to History. */
export function storedPossibilityViews(stored: readonly ListedPossibility[], candidates: readonly WebsiteRebuildCandidate[], summaries: { evidence: (workId: string) => string | null } = { evidence: () => null }): WorkspaceSystemPossibility[] {
  return stored.flatMap(({ possibility: p, sourceRef }) => {
    if (p.status !== "exploring" && p.status !== "ready") return [];
    const askContent = [...p.introduces, ...p.changes].find(item => item.candidate.content.kind === "ask-inquiry-follow-up" || ["ask-website-pages", "ask-existing-booking-page", "ask-existing-website-pages"].includes(String(item.candidate.content.kind)))?.candidate.content;
    const workId = sourceRef?.startsWith(REBUILD_SOURCE_PREFIX) ? sourceRef.slice(REBUILD_SOURCE_PREFIX.length)
      : typeof askContent?.rebuildWorkId === "string" ? askContent.rebuildWorkId : null;
    const candidate = workId ? candidates.find((item) => item.workId === workId) : undefined;
    let tryHref: string | undefined;
    try {
      if (askContent) tryHref = possibilityPreviewPath({ workspaceId: p.businessId, possibilityId: p.id, candidateRevision: p.candidateRevision });
    } catch { /* Keep the native review link when signing is not configured. */ }
    return [{
      id: p.id,
      title: p.title,
      summary: askContent ? p.intent : candidate?.summary ?? p.intent,
      status: p.status,
      affects: [...new Set([...p.changes.map((c) => c.baseline.systemId), ...(typeof askContent?.contextSystemId === "string" ? [askContent.contextSystemId] : [])])],
      evidence: candidate?.evidence ?? (workId ? summaries.evidence(workId) : null),
      previewHref: candidate?.previewHref ?? null,
      ...(tryHref ? { tryHref } : {}),
      workId: workId ?? p.id,
      stored: true,
      staleReason: lastStale(p),
    }];
  });
}

/** Running, partly live or settled activations, as the In progress line and the System page block. */
export function activationViews(rows: ReadonlyArray<{ possibility: Possibility; activation: Activation }>): WorkspaceSystemActivation[] {
  return rows.map(({ possibility: p, activation: a }) => {
    const name = p.title.replace(/^A rebuilt /, "the rebuilt ");
    const view = customerActivationView(a, name);
    return {
      id: a.id, possibilityId: p.id, title: p.title, status: a.status, headline: view.headline, partlyLive: view.partlyLive,
      done: view.done, total: view.total, affects: p.changes.map((c) => c.baseline.systemId),
      lines: view.lines.filter((line) => !line.isolated).map(({ label, state, detail }) => ({ label, state, detail })),
    };
  });
}

/**
 * What changed receipts from Make real: one per accepted live effect and
 * one summary per activation. An isolated receipt is never shown as a real
 * change. Plus Strelva's idle withdraws of Possibilities.
 */
export function makeRealReceipts(rows: ReadonlyArray<{ possibility: Possibility; activation: Activation | null }>, since: number): WorkspaceSystemReceipt[] {
  const receipts: WorkspaceSystemReceipt[] = [];
  for (const { possibility: p, activation: a } of rows) {
    const systemId = p.changes[0]?.baseline.systemId ?? null;
    const withdrawn = [...p.history].reverse().find((h) => h.kind === "withdraw_idle");
    if (p.status === "withdrawn" && withdrawn && Date.parse(withdrawn.at) >= since) {
      receipts.push({ ...(withdrawn.actorId === "strelva" ? { actor: { kind: "platform" as const } } : {}), id: `possibility:${p.id}:withdrawn`, systemId, sentence: actorSentence(withdrawn.actorId === "strelva" ? { kind: "platform" } : null, `set aside "${p.title}" after 90 days without activity`), at: withdrawn.at, undo: "Ask Strelva to open it again" });
    }
    if (!a) continue;
    for (const step of a.steps) {
      if (step.kind !== "effect" || step.effect !== "accepted" || step.receipt?.adapterMode !== "live") continue;
      const at = step.receipt.acceptedAt;
      if (Date.parse(at) < since) continue;
      const undo = step.status === "compensated" ? "Undone"
        : step.reversibility === "irreversible" ? "Can't be undone: it already happened outside Strelva"
          : "Undo from History";
      const confirmed = step.readBack?.status === "failed" ? " (not yet confirmed)" : "";
      receipts.push({ id: `activation:${a.id}:${step.id}`, systemId, sentence: actorSentence(null, `${step.label}${confirmed}`), at, undo });
    }
    if ((a.status === "made_real" || a.status === "rolled_back") && Date.parse(a.updatedAt) >= since) {
      receipts.push({ id: `activation:${a.id}`, systemId, sentence: a.status === "made_real" ? actorSentence(null, `made "${p.title}" live`) : actorSentence(null, `undid "${p.title}"`), at: a.updatedAt, undo: a.status === "made_real" ? "Undo from History" : "Undone" });
    }
  }
  return receipts.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

const IMPLEMENTATION_SENTENCE: Record<string, string> = {
  tenant_content: "Website content changed",
  website_document: "Strelva published a new release of the site",
  application_release: "Strelva published a new release",
  inquiry_config: "The inquiry form changed",
  schedule: "Booking settings changed",
};

/** The last changes to one System: its revisions, newest first. Never called "Version". */
export function revisionHistory(systemId: string, revisions: readonly SystemRevision[], limit = 5): WorkspaceSystemHistoryRow[] {
  return [...revisions].sort((a, b) => b.number - a.number).slice(0, limit).map((r) => ({
    id: `revision:${r.id}`,
    systemId,
    sentence: actorCopy(r.summary === "Adopted at conversion."
      ? "Strelva started running it"
      : r.implementation.kind === "make_real_content"
        ? `Made live: ${r.summary ?? "a change"}`
        : `${IMPLEMENTATION_SENTENCE[r.implementation.kind] ?? r.summary ?? "Changed"}`, null),
    at: r.createdAt,
    releaseRef: r.implementation.ref,
    implementationKind: r.implementation.kind,
  }));
}

/** Stored website and inquiry Systems a rebuild candidate targets. */
export function storedTargets(listing: BusinessSystems, candidates: readonly WebsiteRebuildCandidate[], target: (candidate: WebsiteRebuildCandidate) => { site: SystemListing; domain: string } | undefined): StoredTarget[] {
  return candidates.flatMap((candidate) => {
    const found = target(candidate);
    if (!found || found.site.provenance !== "stored" || !found.site.system.currentRevision) return [];
    const inquiries = listing.connections
      .filter(({ connection }) => connection.kind === "appear" && connection.state !== "disconnected" && connection.target.type === "system" && connection.target.system.systemId === found.site.system.id)
      .map(({ connection }) => listing.systems.find((item) => item.system.id === connection.source.systemId))
      .filter((item): item is SystemListing => Boolean(item && item.system.kind === "inquiry" && item.provenance === "stored" && item.system.currentRevision));
    return [{ candidate, site: found.site, inquiries, domain: found.domain }];
  });
}

/** Exact native Inquiry alternatives use their real isolated engine rehearsal, then the existing plan lifecycle. */
export async function syncAskInquiryFollowUpPossibilities(deps: {
  repo: SupabasePossibilityRepository; live: LiveSystemsReader; actorId: string; at: string;
  stored: ListedPossibility[]; canWrite: boolean; current(selection: unknown): Promise<boolean>;
}): Promise<ListedPossibility[]> {
  if (!deps.canWrite) return deps.stored;
  const rows = [...deps.stored];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const p = row.possibility;
    const content = p.changes.find(change => change.candidate.content.kind === "ask-inquiry-follow-up")?.candidate.content;
    if (!content || p.activationId || !["exploring", "ready"].includes(p.status)) continue;
    try {
      if (!followUpTryView(content.selection, content.draft, content.rehearsal) || !await deps.current(content.selection)) {
        if (p.status === "ready") {
          const stale = returnToExploring(p, "The native Inquiry configuration changed. Review a refreshed alternative.", deps.actorId, deps.at);
          await deps.repo.save(stale, p.revision);
          rows[index] = { ...row, possibility: stale };
        }
        continue;
      }
      if (p.status === "exploring") rows[index] = { ...row, possibility: await prepare(p, true, deps) };
    } catch { /* Missing authority, moved native rules, or concurrent saves remain held for review. */ }
  }
  return rows;
}
