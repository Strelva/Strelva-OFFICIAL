import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readBusinessRecord, readConfirmedBusinessFacts, patchBusinessRecord } from "@/platform/business-record/service";
import { factValueSchemas, type ConfirmedBusinessFacts } from "@/platform/business-record/contracts";
import { systemsReleasedFor, systemsReleaseMayBeOn } from "@/platform/systems-release";
import { listBusinessSystems } from "@/platform/systems/from-existing";
import { createSupabaseSystemStore } from "@/platform/systems/supabase-store";
import { getSupabase } from "@/platform/infra/db/client";
import { getRedis } from "@/platform/infra/redis";
import { requireTenantPermission } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { requireActiveSubscription } from "@/lib/subscription";
import { getTemplateManifestForTenant } from "@/lib/template-manifests";
import { getSiteCapabilityManifest, manifestAllowsAction } from "@/lib/site-capabilities";
import { getContent, getDraftContent } from "@/lib/storage";
import { applySectionUpdate } from "@/lib/apply-section-update";
import { addEvent } from "@/lib/events";
import { siteEditingFor, createNativeFactMappingStore, nativeMappingSections, nativeMappedSection, nativeChangedKeys, nativeFactMappingInputSchema, type NativeFactMappingInput, type NativeFactSection, type NativeMappedFacts } from "@/products/websites/server";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import type { ResolveBy } from "@/platform/needs-you/adapters";
import type { BusinessFactsReceipt } from "@/platform/needs-you/sources/business-facts";
import { needsYouStore } from "@/platform/needs-you/server";

const CONTACT_KEYS = ["phone", "email", "address", "hours"] as const;
const NATIVE_KEYS = [...CONTACT_KEYS, "display_name"] as const;

/** Only changed confirmed public contact facts: what the owner wrote or
 * decided, never a pending operator or agency edit (#509). Every other
 * approved contact field stays intact; deletions require manual review. */
export function nativeContactFacts(confirmed: ConfirmedBusinessFacts, changed: readonly string[], current: Record<string, unknown>): Record<string, unknown> {
  const next = { ...current };
  for (const key of CONTACT_KEYS.filter(key => changed.includes(key))) {
    if (confirmed.facts[key] === undefined) continue;
    const parsed = factValueSchemas[key].safeParse(confirmed.facts[key]);
    if (!parsed.success) continue;
    if (key === "phone" || key === "email") next[key] = parsed.data;
    if (key === "address") {
      const address = factValueSchemas.address.parse(parsed.data);
      next.address = address.formatted ?? [address.line1, address.line2, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(", ");
    }
    if (key === "hours") {
      const hours = factValueSchemas.hours.parse(parsed.data);
      // The existing contact section is free text, so retain dated exceptions
      // and timezone rather than silently projecting only its weekly schedule.
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      next.hours = [...[1, 2, 3, 4, 5, 6, 0].map(day => `${names[day]}: ${hours.weekly.filter(row => row.day === day).map(row => `${row.opens}–${row.closes}`).join(", ") || "Closed"}`),
        ...(hours.overrides ?? []).map(row => `${row.date}${row.label ? ` (${row.label})` : ""}: ${row.closed ? "Closed" : `${row.opens}–${row.closes}`}`), `Timezone: ${hours.timezone}`].join("\n");
    }
  }
  return next;
}

type Db = { rpc(name: string, input: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export function createNativeFactReviewStore(db?: Db) {
  const identity = (actor: WorkspaceActor) => ({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  async function rpc(name: string, input: Record<string, unknown>) {
    const result = await (db ?? getSupabase() as unknown as Db | null)?.rpc(name, input);
    if (!result || result.error) throw new Error("Native website fact review storage is unavailable.");
    return result.data;
  }
  return {
    async claim(actor: WorkspaceActor, workspaceId: string, tenantId: string, revision: number, token: string, section: NativeFactSection = "contact", mappingRevision = 0) {
      return z.boolean().parse(await rpc("claim_native_website_mapped_fact_review", { ...identity(actor), p_workspace_id: workspaceId, p_tenant_id: tenantId, p_record_revision: revision, p_claim_token: token, p_section: section, p_mapping_revision: mappingRevision }));
    },
    async record(token: string, status: "queued" | "blocked" | "unconfirmed", eventId: string | null) {
      await rpc("record_native_website_fact_review", { p_claim_token: token, p_status: status, p_event_id: eventId });
    },
  };
}

const live = {
  enabled: () => process.env.STRELVA_WEBSITE_NATIVE_FACTS_ENABLED === "1" && systemsReleaseMayBeOn(),
  released: systemsReleasedFor,
  record: readBusinessRecord,
  confirmed: readConfirmedBusinessFacts,
  sites: (actor: WorkspaceActor, workspaceId: string) => listBusinessSystems(actor, workspaceId, { store: createSupabaseSystemStore() }),
  tenant: getTenantConfig,
  allowed: async (tenantId: string) => !(await requireTenantPermission(tenantId, "content:write")) && !(await requireActiveSubscription(tenantId)),
  template: getTemplateManifestForTenant,
  manifest: getSiteCapabilityManifest,
  current: (tenantId: string, section: NativeFactSection = "contact") => getContent(section, tenantId),
  draft: (tenantId: string, section: NativeFactSection = "contact") => getDraftContent(section, tenantId),
  mapping: createNativeFactMappingStore().read,
  queueAvailable: () => Boolean(getRedis()),
  apply: applySectionUpdate,
  reviews: createNativeFactReviewStore(),
  report: async (tenantId: string, revision: number, reason?: NativeFactsSkip) => { await addEvent({ tenantId, source: "website", type: "change_verify_failed", status: "pending",
    title: "Business facts need a website review", body: "The business record was saved. Its native website update could not be prepared; inspect the saved review claim before retrying.",
    metadata: { reviewAudience: "operator", kind: "native_business_facts", recordRevision: revision, ...(reason ? { reason } : {}) } }, { requirePersistence: true }); },
};
export type NativeWebsiteFactPorts = typeof live;

/** Why a linked native site's contact review wasn't queued. */
export type NativeFactsSkip = "record_moved" | "not_allowed" | "queue_unavailable" | "draft_held" | "changed_before_dispatch" | "not_queued" | "failed" | "already_claimed" | "facts_unconfirmed";
/**
 * What preparation did for the linked native websites. `ready`: queued, or
 * already showing the confirmed details. `needsReview`: still showing older
 * details with nothing queued; each has an operator item unless `reported`
 * is false because recording it failed too. Sites that don't take contact
 * reviews (another delivery model, no contact section) are in neither.
 */
export type NativeFactsPreparation = { ready: string[]; needsReview: Array<{ tenantId: string; reason: NativeFactsSkip; reported: boolean }> };

export function createNativeWebsiteFactService(ports: NativeWebsiteFactPorts = live) {
  return async (actor: WorkspaceActor, workspaceId: string, revision: number, changed: readonly string[]): Promise<NativeFactsPreparation> => {
    const outcome: NativeFactsPreparation = { ready: [], needsReview: [] };
    if (!ports.enabled() || !changed.some(key => NATIVE_KEYS.some(field => field === key) || key.startsWith("service:"))) return outcome;
    if (!(await ports.released(actor, workspaceId))) return outcome;
    const record = await ports.record(actor, workspaceId);
    if (record.access !== "owner" && record.access !== "admin") return outcome;
    const moved = record.revision !== revision;
    const skip = async (tenantId: string, reason: NativeFactsSkip, reported = false) => {
      if (outcome.needsReview.some(row => row.tenantId === tenantId && row.reason === reason)) return;
      if (!reported) reported = await ports.report(tenantId, revision, reason).then(() => true, () => false);
      outcome.needsReview.push({ tenantId, reason, reported });
    };
    const project = (section: NativeFactSection, confirmed: ConfirmedBusinessFacts, mapped: NativeMappedFacts, current: Record<string, unknown>) => {
      if (section !== "contact") {
        const targeted = section === "services"
          ? { ...mapped, mapping: { ...mapped.mapping, services: mapped.mapping.services.filter(binding => changed.includes(`service:${binding.serviceId}`)) } }
          : mapped;
        return nativeMappedSection(section, confirmed, targeted, current);
      }
      const fields = changed.filter(key => mapped.mapping.fields.some(field => field === key));
      return { data: nativeContactFacts(confirmed, fields, current), held: fields.some(key => CONTACT_KEYS.some(field => field === key) && confirmed.facts[key as keyof typeof confirmed.facts] === undefined) };
    };
    const sites = await ports.sites(actor, workspaceId);
    const visited = new Set<string>();
    for (const site of sites.systems.filter(site => site.system.kind === "website" && site.system.lifecycle !== "paused")) {
      const tenantId = site.references.tenantId;
      if (!tenantId || visited.has(tenantId)) continue;
      visited.add(tenantId);
      try {
        const tenant = await ports.tenant(tenantId);
        if (!tenant?.active || tenant.deliveryModel !== "custom_repo" || siteEditingFor(tenant) !== "native") continue;
        if (moved) { await skip(tenantId, "record_moved"); continue; }
        if (!(await ports.allowed(tenantId))) { await skip(tenantId, "not_allowed"); continue; }
        const mapped = await ports.mapping(actor, workspaceId, tenantId);
        const [template, manifest] = await Promise.all([ports.template(tenantId), ports.manifest(tenantId)]);
        const sections = nativeMappingSections(mapped.mapping, changed).filter(section => template.contentSections.includes(section) && manifestAllowsAction(manifest, section, "draft"));
        if (!sections.length) continue;
        if (!ports.queueAvailable()) { await skip(tenantId, "queue_unavailable"); continue; }
        let ready = true;
        for (const section of sections) {
          let current: Awaited<ReturnType<NativeWebsiteFactPorts["current"]>>;
          let confirmed: ConfirmedBusinessFacts;
          try { [current, confirmed] = await Promise.all([ports.current(tenantId, section), ports.confirmed(actor, workspaceId)]); }
          catch { ready = false; await skip(tenantId, "failed"); continue; }
          if (mapped.recordRevision !== revision || confirmed.revision !== revision) { ready = false; await skip(tenantId, "record_moved"); continue; }
          const next = project(section, confirmed, mapped, current as unknown as Record<string, unknown>);
          if (next.held) { ready = false; await skip(tenantId, "facts_unconfirmed"); continue; }
          if (JSON.stringify(next.data) === JSON.stringify(current)) continue;
          const token = randomUUID();
          try {
            // Existing contact claims keep their identity. Every section has its
            // own durable exact-revision claim, including uncertain acceptance.
            if (!(await ports.reviews.claim(actor, workspaceId, tenantId, revision, token, section, mapped.mapping.revision))) {
              ready = false; outcome.needsReview.push({ tenantId, reason: "already_claimed", reported: false }); continue;
            }
            if (await ports.draft(tenantId, section)) {
              ready = false; await ports.reviews.record(token, "blocked", null); await skip(tenantId, "draft_held"); continue;
            }
            const latest = await ports.tenant(tenantId);
            const latestRecord = await ports.record(actor, workspaceId);
            const latestSites = await ports.sites(actor, workspaceId);
            const [latestTemplate, latestManifest, latestMapped] = await Promise.all([ports.template(tenantId), ports.manifest(tenantId), ports.mapping(actor, workspaceId, tenantId)]);
            if (!latest?.active || latest.deliveryModel !== "custom_repo" || siteEditingFor(latest) !== "native" || latestRecord.revision !== revision ||
                !["owner", "admin"].includes(latestRecord.access) || latestMapped.mapping.revision !== mapped.mapping.revision || latestMapped.recordRevision !== revision ||
                !latestSites.systems.some(site => site.references.tenantId === tenantId && site.system.kind === "website" && site.system.lifecycle !== "paused") ||
                !latestTemplate.contentSections.includes(section) || !manifestAllowsAction(latestManifest, section, "draft") ||
                !ports.enabled() || !(await ports.released(actor, workspaceId)) || !(await ports.allowed(tenantId))) {
              ready = false; await ports.reviews.record(token, "blocked", null); await skip(tenantId, "changed_before_dispatch"); continue;
            }
            const latestCurrent = await ports.current(tenantId, section);
            const latestConfirmed = await ports.confirmed(actor, workspaceId);
            const latestNext = project(section, latestConfirmed, latestMapped, latestCurrent as unknown as Record<string, unknown>);
            if (latestConfirmed.revision !== revision || latestNext.held || await ports.draft(tenantId, section)) {
              ready = false; await ports.reviews.record(token, "blocked", null); await skip(tenantId, "changed_before_dispatch"); continue;
            }
            if (JSON.stringify(latestNext.data) === JSON.stringify(latestCurrent)) { await ports.reviews.record(token, "blocked", null); continue; }
            const result = await ports.apply({ tenantId, section, data: latestNext.data, tenantConfig: latest, siteManifest: latestManifest, forceReview: true,
              requestId: `business-facts:${workspaceId}:${revision}${section === "contact" ? "" : `:${section}`}` });
            await ports.reviews.record(token, result.status === "queued" ? "queued" : "blocked", result.status === "queued" ? result.eventId : null);
            if (result.status !== "queued") { ready = false; await skip(tenantId, "not_queued"); }
          } catch {
            ready = false; await ports.reviews.record(token, "unconfirmed", null).catch(() => undefined);
            // Acceptance may already have occurred. Never replay it automatically.
            if (!outcome.needsReview.some(row => row.tenantId === tenantId)) await skip(tenantId, "failed");
          }
        }
        if (ready) outcome.ready.push(tenantId);
      } catch {
        // An unavailable site's mapping or content must not lose successful
        // results or prevent another linked site preparing its own review.
        await skip(tenantId, "failed");
      }
    }
    return outcome;
  };
}

/** The business patch commits first. Preparing a review is a separate effect
 * and cannot turn an accepted business save into a retry. */
export function nativeWebsiteFactsPatch(patch: typeof patchBusinessRecord = patchBusinessRecord, prepare = createNativeWebsiteFactService()) {
  return async (...args: Parameters<typeof patchBusinessRecord>) => {
    const result = await patch(...args);
    if (process.env.STRELVA_WEBSITE_NATIVE_FACTS_ENABLED === "1") {
      const raw = args[3] as Parameters<typeof nativeChangedKeys>[0];
      try { await prepare(args[0], args[1], result.revision, nativeChangedKeys(raw)); } catch { /* The business save remains accepted. */ }
    }
    return result;
  };
}

const confirmedLive = {
  enabled: live.enabled,
  /** Linked native custom-repo sites, read without a member (the owner's link has none). */
  nativeTenants: async (workspaceId: string) => {
    const tenants = await Promise.all((await needsYouStore.linkedTenants(workspaceId)).map(link => getTenantConfig(link.tenantId)));
    return tenants.filter(tenant => tenant?.active && tenant.deliveryModel === "custom_repo" && siteEditingFor(tenant) === "native").map(tenant => tenant!.id);
  },
  report: async (tenantId: string, revision: number) => { await addEvent({ tenantId, source: "website", type: "change_verify_failed", status: "pending",
    title: "Owner-approved business facts need a website review", body: "The owner approved new business details by email link. Prepare this site's mapped website review from the confirmed business record.",
    metadata: { reviewAudience: "operator", kind: "native_business_facts", recordRevision: revision, reason: "owner_link_confirmation" } }, { requirePersistence: true }); },
};
export type ConfirmedNativeFactPorts = typeof confirmedLive;

/**
 * After the owner's Needs you decision confirms business facts (#509), a
 * native website's contact section follows as it does after the owner's own
 * save. Signed in, the owner prepares that review as themselves. A signed
 * link carries no member identity, so each linked native site gets an
 * operator review item instead, and the decision reports the website as
 * pending rather than live.
 */
export function createConfirmedNativeFactsEffect(prepare = createNativeWebsiteFactService(), ports: ConfirmedNativeFactPorts = confirmedLive) {
  return async (receipt: BusinessFactsReceipt, by: ResolveBy): Promise<{ websitePending: boolean }> => {
    const changed = [...receipt.factKeys.filter(key => NATIVE_KEYS.some(field => field === key)), ...(receipt.serviceIds?.map(id => `service:${id.toLowerCase()}`) ?? [])];
    const missingServiceScope = receipt.servicesChanged === true && receipt.serviceIds === undefined;
    if ((!changed.length && !missingServiceScope) || !ports.enabled()) return { websitePending: false };
    const actor = by.kind === "session" ? by.actor : by.kind === "owner_link" ? by.actor : null;
    if (by.kind !== "owner_link" && !actor) return { websitePending: false };
    if (actor && !missingServiceScope) {
      // Any linked native site left without a queued review keeps the decision
      // unverified; preparation has already put it in front of an operator.
      const prepared = await prepare(actor, receipt.workspaceId, receipt.recordRevision, changed).catch(() => null);
      if (prepared) return { websitePending: prepared.needsReview.length > 0 };
    }
    // No member identity, or preparation itself failed: every linked native
    // site gets an operator item and the website is reported pending.
    const tenants = await ports.nativeTenants(receipt.workspaceId);
    for (const tenantId of tenants) await ports.report(tenantId, receipt.recordRevision);
    return { websitePending: tenants.length > 0 };
  };
}

/** Configuration is explicit and separately revisioned. A mapping change never
 * changes site content; the next changed confirmed fact prepares its review. */
export function createNativeWebsiteMappingService(ports: NativeWebsiteFactPorts = live, store = createNativeFactMappingStore()) {
  async function context(actor: WorkspaceActor, workspaceId: string, tenantId: string) {
    if (!ports.enabled() || !(await ports.released(actor, workspaceId))) throw new WorkspaceAccessError();
    const record = await ports.record(actor, workspaceId);
    if (record.access !== "owner") throw new WorkspaceAccessError();
    const sites = await ports.sites(actor, workspaceId);
    if (!sites.systems.some(site => site.references.tenantId === tenantId && site.system.kind === "website" && site.system.lifecycle !== "paused")) throw new WorkspaceAccessError();
    const tenant = await ports.tenant(tenantId);
    if (!tenant?.active || tenant.deliveryModel !== "custom_repo" || siteEditingFor(tenant) !== "native" || !(await ports.allowed(tenantId))) throw new WorkspaceAccessError();
    const [template, manifest] = await Promise.all([ports.template(tenantId), ports.manifest(tenantId)]);
    const sections = (["contact", "settings", "services"] as const).filter(section => template.contentSections.includes(section) && manifestAllowsAction(manifest, section, "draft"));
    const services = sections.includes("services") ? (await ports.current(tenantId, "services") as unknown as { services?: Array<{ id: string; name: string }> }).services ?? [] : [];
    return { record, sections, services };
  }
  return {
    async eligibleSites<T extends { tenantId: string }>(actor: WorkspaceActor, workspaceId: string, sites: T[]): Promise<T[]> {
      if (!ports.enabled() || !(await ports.released(actor, workspaceId))) return [];
      const linked = await ports.sites(actor, workspaceId);
      const eligible = await Promise.all(sites.map(async site => {
        try {
          if (!linked.systems.some(row => row.references.tenantId === site.tenantId && row.system.kind === "website" && row.system.lifecycle !== "paused")) return false;
          const tenant = await ports.tenant(site.tenantId);
          if (!tenant?.active || tenant.deliveryModel !== "custom_repo" || siteEditingFor(tenant) !== "native" || !(await ports.allowed(site.tenantId))) return false;
          const [template, manifest] = await Promise.all([ports.template(site.tenantId), ports.manifest(site.tenantId)]);
          return (["contact", "settings", "services"] as const).some(section => template.contentSections.includes(section) && manifestAllowsAction(manifest, section, "draft"));
        } catch { return false; }
      }));
      return sites.filter((_site, index) => eligible[index]);
    },
    async read(actor: WorkspaceActor, workspaceId: string, tenantId: string) {
      const { record, services, sections } = await context(actor, workspaceId, tenantId);
      const { mapping } = await store.read(actor, workspaceId, tenantId);
      const availableFields = NATIVE_KEYS.filter(field => sections.includes(field === "display_name" ? "settings" : "contact"));
      return { mapping: { ...mapping, fields: mapping.fields.filter(field => availableFields.includes(field)) }, availableFields,
        nativeServices: services.map(({ id, name }) => ({ id, name })), businessServices: record.services.filter(service => service.active).map(({ id, name }) => ({ id, name })) };
    },
    async save(actor: WorkspaceActor, workspaceId: string, tenantId: string, revision: number, raw: NativeFactMappingInput) {
      const mapping = nativeFactMappingInputSchema.parse(raw);
      const { record, sections, services } = await context(actor, workspaceId, tenantId);
      if (mapping.fields.some(field => !sections.includes(field === "display_name" ? "settings" : "contact")) || mapping.services.some(binding =>
        !sections.includes("services") || services.filter(service => service.id === binding.nativeServiceId).length !== 1 || !record.services.some(service => service.id === binding.serviceId && service.active))) {
        throw new z.ZodError([{ code: "custom", path: [], message: "Choose one current native service and business service for each mapping." }]);
      }
      return { mapping: (await store.save(actor, workspaceId, tenantId, revision, mapping)).mapping };
    },
  };
}
