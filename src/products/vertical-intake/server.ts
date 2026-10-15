import { createHash } from "node:crypto";
import { z } from "zod";
import { scoreLeadSpam } from "@/platform/infra/lead-spam";
import { builtInApp, builtInAppReleaseLabel } from "@/platform/app-releases";
import { manualBookingsEnabled } from "@/platform/bookings/manual";
import { resolveBookingScope } from "@/platform/bookings/booking-scope";
import { nativeServices } from "@/platform/bookings/native";
import { readBusinessRecord } from "@/platform/business-record/service";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import {
  appOrigin, connectedInquiryRecordsEnabled, connectedSitesStore, ConnectedSiteInputError, installSnippet,
} from "@/products/connected-sites/server";
import { normalizeOrigin, safePath, type ConnectedSite, type ResolvedConnectedSite } from "@/products/connected-sites/contracts";
import {
  intakeInstallConfigSchema, intakeReviewLines, publicIntakeForm, validateIntakeAnswers, verticalIntakeAppIdSchema,
  type IntakeInstallConfig, type PublicIntakeForm, type VerticalIntakeAppId,
} from "./contracts";
import { intakeDefinition } from "./definitions";
import { checkIntakeOnPage, type IntakeLiveCheck } from "./live-check";
import { intakeCanGoLive, intakeReadiness, type IntakeReadinessRow } from "./readiness";
import {
  IntakeUnavailableError, verticalIntakeStore, type IntakeInstall, type IntakeRelease, type IntakeSubmission, type VerticalIntakeStore,
} from "./store";
import { intakeEmailOn, intakeSensitiveFieldsAvailable, verticalIntakePublicFor } from "./release";

export * from "./release";
export { IntakeUnavailableError, verticalIntakeStore } from "./store";
export type { IntakeLiveRequests, IntakeVisit, IntakeVisitRead, VerticalIntakeStore } from "./store";
export { intakeReadiness, intakeCanGoLive } from "./readiness";
export { checkIntakeOnPage } from "./live-check";
export type { IntakeInstall, IntakeRelease, IntakeSubmission, IntakeReadinessRow, IntakeLiveCheck };

type FactMap = Record<string, unknown>;

/** The business record's confirmed facts as plain values. */
function recordFacts(record: Awaited<ReturnType<typeof readBusinessRecord>>): FactMap {
  const facts: FactMap = {};
  for (const [key, entry] of Object.entries(record.facts)) if (entry && entry.verified) facts[key] = entry.value;
  return facts;
}

function activeVerifiedSites(sites: ConnectedSite[]): ConnectedSite[] {
  return sites.filter(site => site.status === "active" && site.verifiedAt);
}

export interface IntakeAppView {
  app: { appId: VerticalIntakeAppId; name: string; label: string };
  access: string;
  install: IntakeInstall | null;
  releases: IntakeRelease[];
  readiness: IntakeReadinessRow[];
  canGoLive: boolean;
  sites: Array<{ siteId: string; host: string; siteKey: string; lines: { script: string; mount: string }; codeSnippet: string }>;
  services: Array<{ id: string; name: string }>;
  submissions: Array<IntakeSubmission & { reasonLabel: string | null }>;
  sensitiveAvailable: boolean;
  emailOn: boolean;
  manualBookingsOn: boolean;
  previewForm: PublicIntakeForm;
}

async function bookingServices(workspaceId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const catalog = await nativeServices(resolveBookingScope(workspaceId));
    return catalog.services.map(service => ({ id: service.id, name: service.name }));
  } catch {
    return [];
  }
}

export async function readIntakeApp(actor: WorkspaceActor, workspaceId: string, rawAppId: string, deps: { store?: VerticalIntakeStore; now?: Date } = {}): Promise<IntakeAppView> {
  const appId = verticalIntakeAppIdSchema.parse(rawAppId);
  const store = deps.store ?? verticalIntakeStore();
  const [app, record, sites, services, manualBookingsOn] = await Promise.all([
    store.readApp(actor, workspaceId, appId),
    readBusinessRecord(actor, workspaceId),
    connectedSitesStore().list(actor, workspaceId).catch(() => [] as ConnectedSite[]),
    bookingServices(workspaceId),
    manualBookingsEnabled().catch(() => false),
  ]);
  const facts = recordFacts(record);
  const verified = activeVerifiedSites(sites);
  const config = app.install?.draftConfig ?? intakeInstallConfigSchema.parse({});
  const serviceName = services.find(service => service.id === config.bookingServiceId)?.name ?? null;
  const emailOn = intakeEmailOn();
  const readiness = intakeReadiness({ facts, verifiedSites: verified.length, bookingServiceName: serviceName, manualBookingsOn, emailOn });
  const sensitiveAvailable = intakeSensitiveFieldsAvailable();
  const previewForm = publicIntakeForm(intakeDefinition(appId), app.install?.liveRelease ?? 0, config, facts, { sensitiveAvailable, now: deps.now ?? new Date() });
  const reasonField = previewForm.fields.find(field => field.id === "reason");
  const definition = builtInApp(appId);
  return {
    app: { appId, name: definition.name, label: builtInAppReleaseLabel(definition, app.install?.liveRelease ?? 1) },
    access: app.access,
    install: app.install,
    releases: app.releases,
    readiness,
    canGoLive: intakeCanGoLive(readiness),
    sites: verified.map(site => ({
      siteId: site.id, host: site.siteHost, siteKey: site.publicKey,
      lines: { script: installSnippet(site).script, mount: `<div data-strelva-app="${appId}"></div>` },
      codeSnippet: `<StrelvaIntake baseUrl="${appOrigin()}" siteKey="${site.publicKey}" appId="${appId}" />`,
    })),
    services,
    submissions: app.submissions.map(submission => ({
      ...submission,
      reasonLabel: reasonField?.options?.find(option => option.value === submission.answers.reason)?.label ?? null,
    })),
    sensitiveAvailable,
    emailOn,
    manualBookingsOn,
    previewForm,
  };
}

export async function saveIntakeDraft(actor: WorkspaceActor, workspaceId: string, rawAppId: string, expectedRevision: number, rawConfig: unknown, deps: { store?: VerticalIntakeStore; sites?: (actor: WorkspaceActor, workspaceId: string) => Promise<ConnectedSite[]> } = {}): Promise<IntakeInstall> {
  const appId = verticalIntakeAppIdSchema.parse(rawAppId);
  const parsed = intakeInstallConfigSchema.safeParse(rawConfig);
  if (!parsed.success) throw new ConnectedSiteInputError("Check the form settings and try again.");
  const config: IntakeInstallConfig = parsed.data;
  if (config.pageUrl) {
    const origin = normalizeOrigin(config.pageUrl);
    const sites = activeVerifiedSites(await (deps.sites ?? ((a, w) => connectedSitesStore().list(a, w)))(actor, workspaceId));
    if (!origin || !sites.some(site => site.allowedOrigins.includes(origin))) throw new ConnectedSiteInputError("Use a page on your connected website.");
  }
  if (config.collectMemberId && !intakeSensitiveFieldsAvailable()) throw new ConnectedSiteInputError("Asking for member IDs isn't available yet.");
  return (deps.store ?? verticalIntakeStore()).saveDraft(actor, workspaceId, appId, config, expectedRevision);
}

export async function requestIntakeLive(actor: WorkspaceActor, workspaceId: string, rawAppId: string, deps: { store?: VerticalIntakeStore } = {}): Promise<IntakeInstall> {
  const appId = verticalIntakeAppIdSchema.parse(rawAppId);
  const view = await readIntakeApp(actor, workspaceId, appId, deps);
  if (!view.canGoLive) {
    const missing = view.readiness.filter(row => row.blocking && row.state !== "done").map(row => row.label);
    throw new WorkspaceConflictError(`Finish the required steps first: ${missing.join(", ")}.`);
  }
  return (deps.store ?? verticalIntakeStore()).requestLive(actor, workspaceId, appId);
}

export async function pauseIntake(actor: WorkspaceActor, workspaceId: string, rawAppId: string, paused: boolean, deps: { store?: VerticalIntakeStore } = {}): Promise<IntakeInstall> {
  return (deps.store ?? verticalIntakeStore()).pause(actor, workspaceId, verticalIntakeAppIdSchema.parse(rawAppId), paused);
}

/** Looks at the live page. The read itself proves the person may act (owner, admin or agency). */
export async function checkIntakeLive(actor: WorkspaceActor, workspaceId: string, rawAppId: string, deps: { store?: VerticalIntakeStore; fetchPage?: (url: string) => Promise<string | null> } = {}): Promise<IntakeLiveCheck> {
  const appId = verticalIntakeAppIdSchema.parse(rawAppId);
  const store = deps.store ?? verticalIntakeStore();
  const [app, sites] = await Promise.all([store.readApp(actor, workspaceId, appId), connectedSitesStore().list(actor, workspaceId)]);
  if (!["owner", "admin", "agency"].includes(app.access)) throw new WorkspaceConflictError("Only the owner, an admin or the agency can check the live page.");
  if (!app.install) throw new WorkspaceConflictError("Set up Dental intake first.");
  const site = activeVerifiedSites(sites)[0];
  if (!site) throw new WorkspaceConflictError("Connect your website first.");
  const url = app.install.draftConfig.pageUrl ?? site.siteUrl;
  const check = await checkIntakeOnPage({ url, siteKey: site.publicKey, appId, release: app.install.liveRelease }, deps.fetchPage);
  await store.recordLiveCheck(app.install.id, check);
  return check;
}

/** Only an actual owner or admin member reads this; SQL audits every read. */
export async function revealIntakeSensitive(actor: WorkspaceActor, workspaceId: string, submissionId: string, deps: { store?: VerticalIntakeStore } = {}): Promise<Array<{ label: string; value: string }>> {
  const rows = await (deps.store ?? verticalIntakeStore()).readSensitive(actor, workspaceId, submissionId);
  const definition = intakeDefinition("dental_intake");
  return rows.map(row => ({
    label: definition.fields.find(field => field.id === row.fieldId)?.label.replace(/\s*\(optional\)\s*$/i, "") ?? "Detail",
    value: decryptSecret(row.ciphertext),
  }));
}

export async function readPublicIntakeForm(siteKey: string, site: Pick<ResolvedConnectedSite, "workspaceId">, rawAppId: string, now: Date, deps: { store?: VerticalIntakeStore; publicFor?: (workspaceId: string) => Promise<boolean> } = {}): Promise<PublicIntakeForm | null> {
  const parsed = verticalIntakeAppIdSchema.safeParse(rawAppId);
  if (!parsed.success) return null;
  if (!(await (deps.publicFor ?? verticalIntakePublicFor)(site.workspaceId))) return null;
  const store = deps.store ?? verticalIntakeStore();
  const install = await store.resolvePublic(siteKey, parsed.data);
  if (!install) return null;
  const context = await connectedSitesStore().context(siteKey);
  return publicIntakeForm(intakeDefinition(parsed.data, install.definitionVersion), install.release, install.config, context?.facts ?? {}, { sensitiveAvailable: intakeSensitiveFieldsAvailable(), now });
}

const clientId = z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/);
export const publicIntakeSchema = z.object({
  id: clientId,
  sid: clientId.optional(),
  path: z.string().max(500).optional(),
  _hp: z.string().max(500).optional(),
  answers: z.record(z.string().max(64), z.string().max(10_000)),
}).strict();

export type IntakeOutcome =
  | { status: "recorded" | "duplicate"; id: string; triage: "routine" | "urgent" }
  | { status: "held_as_spam" }
  | { status: "ignored" };

/**
 * A patient's form becomes one Inquiry in the one lead store plus one submission row.
 * Spam is held in the one spam pit, without any sensitive value. Nothing here sends email.
 */
export async function submitPublicIntake(
  siteKey: string, site: ResolvedConnectedSite, origin: string | null, rawAppId: string, raw: unknown,
  deps: { now?: Date; store?: VerticalIntakeStore; publicFor?: (workspaceId: string) => Promise<boolean> } = {},
): Promise<IntakeOutcome> {
  const appId = verticalIntakeAppIdSchema.parse(rawAppId);
  const store = deps.store ?? verticalIntakeStore();
  const now = deps.now ?? new Date();
  const input = publicIntakeSchema.parse(raw);
  const form = await readPublicIntakeForm(siteKey, site, appId, now, { store, publicFor: deps.publicFor });
  if (!form) throw new IntakeUnavailableError();
  const trap = Boolean(input._hp);
  if (trap && !connectedInquiryRecordsEnabled()) return { status: "ignored" };
  const validation = validateIntakeAnswers(form, input.answers);
  if (!validation.ok && !trap) throw new ConnectedSiteInputError(validation.message);
  const normalizedOrigin = normalizeOrigin(origin ?? "");
  const sites = connectedSitesStore();
  const capturedAt = now.toISOString();
  const contact = validation.ok ? validation.contact : { name: String(input.answers.name ?? "").slice(0, 200), phone: null, email: null };
  const summary = validation.ok ? validation.summary : "";
  const verdict = scoreLeadSpam({ businessName: contact.name, description: input.answers.note ?? summary, email: contact.email });
  if (trap || verdict.isSpam) {
    // The spam pit never gets a sensitive value or the free-text answers beyond the summary line.
    const payload = { name: contact.name, email: contact.email, phone: contact.phone, message: summary, path: safePath(input.path), capture: `app:${appId}`, signals: verdict.signals, score: verdict.score, ...(trap ? { reason: "honeypot" } : {}) };
    await sites.recordSpam(siteKey, normalizedOrigin, { recordId: `app_${input.id}`, payload, payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), capturedAt });
    return { status: "held_as_spam" };
  }
  if (!validation.ok) throw new ConnectedSiteInputError(validation.message);
  const fields: Record<string, string> = {
    ...validation.answers,
    ...(contact.phone ? { phone: contact.phone } : {}),
    ...(safePath(input.path) ? { page: safePath(input.path)! } : {}),
    app: appId,
    triage: validation.triage,
  };
  const hash = createHash("sha256").update(JSON.stringify([contact.name, contact.phone, contact.email, validation.answers]).toLowerCase()).digest("hex").slice(0, 16);
  const lead = {
    leadId: `lead_${input.id}`, submissionHash: hash, name: contact.name.slice(0, 200),
    ...(contact.email ? { email: contact.email } : {}), message: validation.summary, source: `app:${appId}`, fields, capturedAt,
  };
  const leadResult = await sites.recordInquiry(siteKey, normalizedOrigin, lead);
  const sensitive = intakeSensitiveFieldsAvailable() ? validation.sensitive.map(item => {
    const ciphertext = encryptSecret(item.value);
    if (!ciphertext.startsWith("enc:v1:")) throw new WorkspaceConflictError("Asking for member IDs isn't available yet.");
    return { fieldId: item.fieldId, ciphertext };
  }) : [];
  const submission = await store.recordSubmission(siteKey, normalizedOrigin, appId, leadResult.id, validation.answers, validation.triage, sensitive);
  return { status: leadResult.status === "recorded" && submission.status === "recorded" ? "recorded" : "duplicate", id: submission.id, triage: validation.triage };
}

export async function purgeIntakeSensitive(limit: number, deps: { store?: VerticalIntakeStore } = {}): Promise<number> {
  return (deps.store ?? verticalIntakeStore()).purgeSensitive(limit);
}

/** Honest, owner-readable lines for the Make it live decision. */
export function intakeLiveReviewLines(form: PublicIntakeForm, config: IntakeInstallConfig, bookingServiceName: string | null): string[] {
  return intakeReviewLines(form, config, bookingServiceName, intakeEmailOn());
}
