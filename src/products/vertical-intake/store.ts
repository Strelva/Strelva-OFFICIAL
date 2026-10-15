/**
 * Dental intake persistence: service-role RPCs only
 * (supabase/migrations/20261028100700_vertical_intake.sql). Every table is
 * revoked; SQL rechecks the actor on each workspace call, and the public
 * calls recheck the key, the proven host and the Origin.
 */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { ConnectedSiteInputError, ConnectedSiteRefusedError } from "@/products/connected-sites/server";
import { intakeInstallConfigSchema, type IntakeInstallConfig } from "./contracts";

export interface VerticalIntakeRpc { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** The form is not live for this site (not made live, paused, or the switch is off). */
export class IntakeUnavailableError extends Error {
  constructor() { super("This form isn't available right now. Please call the office."); this.name = "IntakeUnavailableError"; }
}

const timestamp = z.string();
const nullableTimestamp = z.string().nullable().optional().transform(value => value ?? null);

export const liveCheckSchema = z.object({
  state: z.enum(["found", "not_seen", "unreachable"]),
  checkedAt: z.string(),
  url: z.string(),
  release: z.number().int().nullable(),
});

export const installSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  appId: z.literal("dental_intake"),
  status: z.enum(["draft", "live", "paused"]),
  draftConfig: z.unknown().transform(value => intakeInstallConfigSchema.parse(value ?? {})),
  draftRevision: z.number().int().min(1),
  liveRelease: z.number().int().nullable(),
  liveRequestedAt: nullableTimestamp,
  lastLiveCheck: liveCheckSchema.nullable().optional().transform(value => value ?? null),
  updatedAt: timestamp,
});
export type IntakeInstall = z.infer<typeof installSchema>;

const releaseSchema = z.object({
  number: z.number().int().min(1),
  definitionVersion: z.number().int(),
  config: z.unknown().transform(value => intakeInstallConfigSchema.parse(value ?? {})),
  madeLiveAt: timestamp,
  madeLiveBy: z.string(),
});
export type IntakeRelease = z.infer<typeof releaseSchema>;

const answersSchema = z.record(z.string(), z.string());
const submissionSchema = z.object({
  id: z.string().uuid(),
  leadRowId: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  answers: answersSchema,
  triage: z.enum(["routine", "urgent"]).nullable(),
  state: z.enum(["new", "visit_booked", "not_booked"]),
  bookingId: z.string().nullable(),
  createdAt: timestamp,
  hasSensitive: z.boolean(),
});
export type IntakeSubmission = z.infer<typeof submissionSchema>;

const readAppSchema = z.object({
  access: z.string(),
  install: installSchema.nullable(),
  releases: z.array(releaseSchema),
  submissions: z.array(submissionSchema),
});
export type IntakeAppRead = z.infer<typeof readAppSchema>;

const factsSchema = z.record(z.string(), z.unknown());
const liveRequestSchema = z.object({
  installId: z.string().uuid(),
  appId: z.literal("dental_intake"),
  draftRevision: z.number().int(),
  draftConfig: z.unknown().transform(value => intakeInstallConfigSchema.parse(value ?? {})),
  liveRelease: z.number().int().nullable(),
  requestedAt: z.string(),
});
const liveRequestsSchema = z.object({ facts: factsSchema, requests: z.array(liveRequestSchema) });
export type IntakeLiveRequests = z.infer<typeof liveRequestsSchema>;

const visitSchema = z.object({
  submissionId: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  answers: answersSchema,
  triage: z.enum(["routine", "urgent"]).nullable(),
  state: z.enum(["new", "visit_booked", "not_booked"]),
  bookingId: z.string().nullable(),
  createdAt: z.string(),
  bookingServiceId: z.string().nullable(),
});
export type IntakeVisit = z.infer<typeof visitSchema>;
const openVisitsSchema = z.object({ facts: factsSchema, visits: z.array(visitSchema) });
const visitWithFactsSchema = visitSchema.extend({ facts: factsSchema });
export type IntakeVisitRead = z.infer<typeof visitWithFactsSchema>;

const publicSchema = z.object({
  installId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  release: z.number().int().min(1),
  config: z.unknown().transform(value => intakeInstallConfigSchema.parse(value ?? {})),
  definitionVersion: z.number().int(),
});
export type PublicIntakeInstall = z.infer<typeof publicSchema>;

export interface SensitiveCiphertext { fieldId: string; ciphertext: string }

export interface VerticalIntakeStore {
  readApp(actor: WorkspaceActor, workspaceId: string, appId: string): Promise<IntakeAppRead>;
  saveDraft(actor: WorkspaceActor, workspaceId: string, appId: string, config: IntakeInstallConfig, expectedRevision: number): Promise<IntakeInstall>;
  requestLive(actor: WorkspaceActor, workspaceId: string, appId: string): Promise<IntakeInstall>;
  pause(actor: WorkspaceActor, workspaceId: string, appId: string, paused: boolean): Promise<IntakeInstall>;
  readSensitive(actor: WorkspaceActor, workspaceId: string, submissionId: string): Promise<SensitiveCiphertext[]>;
  makeLive(input: { workspaceId: string; installId: string; draftRevision: number; ownerDecisionId: string; userId: string; verifiedEmail: string }): Promise<{ install: IntakeInstall; release: number }>;
  withdrawLiveRequest(workspaceId: string, installId: string): Promise<void>;
  listLiveRequests(workspaceId: string): Promise<IntakeLiveRequests>;
  recordLiveCheck(installId: string, check: z.infer<typeof liveCheckSchema>): Promise<void>;
  resolvePublic(publicKey: string, appId: string): Promise<PublicIntakeInstall | null>;
  recordSubmission(publicKey: string, origin: string | null, appId: string, leadRowId: string, answers: Record<string, string>, triage: "routine" | "urgent", sensitive: SensitiveCiphertext[]): Promise<{ status: "recorded" | "exists"; id: string }>;
  listOpenVisits(workspaceId: string): Promise<{ facts: Record<string, unknown>; visits: IntakeVisit[] }>;
  readVisit(workspaceId: string, submissionId: string): Promise<IntakeVisitRead | null>;
  decideVisit(workspaceId: string, submissionId: string, state: "visit_booked" | "not_booked", bookingId: string | null, decisionId: string): Promise<{ submissionId: string; state: string; bookingId: string | null }>;
  purgeSensitive(limit: number): Promise<number>;
}

const uuid = z.string().uuid();
const identity = (actor: WorkspaceActor) => ({ p_user_id: uuid.parse(actor.userId), p_verified_email: z.string().email().parse(actor.verifiedEmail.trim().toLowerCase()) });

export function createVerticalIntakeStore(db?: VerticalIntakeRpc): VerticalIntakeStore {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = db ?? (getSupabase() as unknown as VerticalIntakeRpc | null);
    if (!client) throw new WorkspaceStoreError("Dental intake is temporarily unavailable.");
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const message = error.message;
      if (message.includes("workspace_access_denied") || message.includes("business_record_access_denied")) throw new WorkspaceAccessError();
      if (message.includes("app_intake_conflict")) throw new WorkspaceConflictError("This form changed since you opened it. Reload and try again.");
      if (message.includes("app_intake_not_found")) throw new WorkspaceConflictError("Set up Dental intake first.");
      if (message.includes("app_intake_never_live")) throw new WorkspaceConflictError("Make it live first.");
      if (message.includes("workspace_exit_future_work_blocked")) throw new WorkspaceConflictError("Work in this business has stopped.");
      if (message.includes("app_intake_unavailable")) throw new IntakeUnavailableError();
      if (message.includes("connected_site_unknown")) throw new ConnectedSiteRefusedError("unknown");
      if (message.includes("connected_site_not_verified")) throw new ConnectedSiteRefusedError("not_verified");
      if (message.includes("connected_site_origin_denied")) throw new ConnectedSiteRefusedError("origin_denied");
      if (message.includes("connected_site_invalid") || message.includes("app_intake_invalid")) throw new ConnectedSiteInputError();
      throw new WorkspaceStoreError("Dental intake is temporarily unavailable.");
    }
    return data;
  }
  const install = (data: unknown) => installSchema.parse(data);
  const scope = (workspaceId: string, actor: WorkspaceActor) => ({ p_workspace_id: uuid.parse(workspaceId), ...identity(actor) });
  return {
    async readApp(actor, workspaceId, appId) { return readAppSchema.parse(await rpc("read_app_intake", { ...scope(workspaceId, actor), p_app_id: appId })); },
    async saveDraft(actor, workspaceId, appId, config, expectedRevision) {
      return install(await rpc("save_app_intake_draft", { ...scope(workspaceId, actor), p_app_id: appId, p_config: config, p_expected_revision: expectedRevision }));
    },
    async requestLive(actor, workspaceId, appId) { return install(await rpc("request_app_intake_live", { ...scope(workspaceId, actor), p_app_id: appId })); },
    async pause(actor, workspaceId, appId, paused) { return install(await rpc("pause_app_intake", { ...scope(workspaceId, actor), p_app_id: appId, p_paused: paused })); },
    async readSensitive(actor, workspaceId, submissionId) {
      return z.array(z.object({ fieldId: z.string(), ciphertext: z.string() })).parse(await rpc("read_app_intake_sensitive", { ...scope(workspaceId, actor), p_submission_id: uuid.parse(submissionId) }));
    },
    async makeLive(input) {
      const data = z.object({ install: installSchema, release: z.number().int() }).parse(await rpc("make_app_intake_live", {
        p_workspace_id: uuid.parse(input.workspaceId), p_install_id: uuid.parse(input.installId), p_draft_revision: input.draftRevision,
        p_owner_decision_id: uuid.parse(input.ownerDecisionId), p_user_id: uuid.parse(input.userId), p_verified_email: input.verifiedEmail.trim().toLowerCase(),
      }));
      return data;
    },
    async withdrawLiveRequest(workspaceId, installId) { await rpc("withdraw_app_intake_live_request", { p_workspace_id: uuid.parse(workspaceId), p_install_id: uuid.parse(installId) }); },
    async listLiveRequests(workspaceId) { return liveRequestsSchema.parse(await rpc("list_app_intake_live_requests", { p_workspace_id: uuid.parse(workspaceId) })); },
    async recordLiveCheck(installId, check) { await rpc("record_app_intake_live_check", { p_install_id: uuid.parse(installId), p_check: check }); },
    async resolvePublic(publicKey, appId) { const data = await rpc("resolve_public_app_intake", { p_public_key: publicKey, p_app_id: appId }); return data ? publicSchema.parse(data) : null; },
    async recordSubmission(publicKey, origin, appId, leadRowId, answers, triage, sensitive) {
      return z.object({ status: z.enum(["recorded", "exists"]), id: z.string() }).parse(await rpc("record_app_intake_submission", {
        p_public_key: publicKey, p_origin: origin, p_app_id: appId, p_lead_row_id: leadRowId, p_answers: answers, p_triage: triage, p_sensitive: sensitive,
      }));
    },
    async listOpenVisits(workspaceId) { return openVisitsSchema.parse(await rpc("list_open_app_intake_visits", { p_workspace_id: uuid.parse(workspaceId) })); },
    async readVisit(workspaceId, submissionId) {
      const data = await rpc("read_app_intake_visit", { p_workspace_id: uuid.parse(workspaceId), p_submission_id: uuid.parse(submissionId) });
      return data ? visitWithFactsSchema.parse(data) : null;
    },
    async decideVisit(workspaceId, submissionId, state, bookingId, decisionId) {
      return z.object({ submissionId: z.string(), state: z.string(), bookingId: z.string().nullable() }).parse(await rpc("decide_app_intake_visit", {
        p_workspace_id: uuid.parse(workspaceId), p_submission_id: uuid.parse(submissionId), p_state: state, p_booking_id: bookingId, p_decision_id: uuid.parse(decisionId),
      }));
    },
    async purgeSensitive(limit) { return z.number().int().parse(await rpc("purge_app_intake_sensitive", { p_limit: limit })); },
  };
}

let override: VerticalIntakeStore | null = null;
/** Tests replace the store; production reads Supabase. */
export function setVerticalIntakeStoreForTests(store: VerticalIntakeStore | null): void { override = store; }
export function verticalIntakeStore(): VerticalIntakeStore { return override ?? createVerticalIntakeStore(); }
