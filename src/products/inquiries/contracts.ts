/**
 * Browser-safe contracts for Strelva's first executable capability: an inquiry
 * form, inquiry record, routing rule, and follow-up. Persistence and provider
 * calls stay behind host adapters. In particular, tenant inquiries remain
 * Redis-authoritative and this contract never treats a Postgres mirror as the
 * inquiry source of truth.
 */

export const INQUIRY_ENGINE_VERSION = 1 as const;
export const INQUIRY_CAPABILITY_KIND = "inquiry" as const;
export const INQUIRY_DEFINITION_VERSION = 1 as const;

/** The only UI components an inquiry definition can select. */
export const INQUIRY_COMPONENTS = Object.freeze([
  "form",
  "text_field",
  "email_field",
  "phone_field",
  "date_field",
  "textarea_field",
  "select_field",
  "record_list",
  "record_detail",
  "routing_rule",
  "follow_up_rule",
] as const);

/** The first slice has one fixed, auditable rehearsal suite. */
export const REHEARSAL_CHECK_IDS = Object.freeze([
  "fields_validate",
  "record_created",
  "routing_resolved",
  "recipient_eligible",
  "sender_disclosed",
  "template_rendered",
  "follow_up_scheduled",
  "external_writes_blocked",
] as const);

export type InquiryComponent = (typeof INQUIRY_COMPONENTS)[number];
export type InquiryFieldKind = "text" | "email" | "phone" | "date" | "textarea" | "select";
export type InquiryFieldValue = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type InquiryRequestState =
  | "shaped"
  | "planned"
  | "editing"
  | "rehearsing"
  | "ready_to_publish"
  | "publishing"
  | "live_unverified"
  | "handled"
  | "failed"
  | "cancelled";

export type InquiryCapabilityStatus = "draft" | "live_unverified" | "live" | "paused" | "failed";
export type InquiryShapeLineKind = "form" | "record" | "routing" | "follow_up";

export interface InquiryShapeLine {
  id: InquiryShapeLineKind;
  kind: InquiryShapeLineKind;
  sentence: string;
  touches: string;
  required: boolean;
  selected: boolean;
}

export interface InquiryShapeProposal {
  id: string;
  requestId: string;
  businessId: string;
  /** Shape-card wire version, separate from a capability definition version. */
  version: typeof INQUIRY_DEFINITION_VERSION;
  intent: string;
  title: string;
  summary: string;
  lines: InquiryShapeLine[];
  /** Non-rendered defaults used when Go compiles the selected shape. */
  defaults: {
    destination: string;
    followUpAfterMinutes: number;
    emailConnection: Pick<InquiryConnectionBinding, "status" | "consent" | "lastCheckedAt">;
  };
  selectedLineIds: InquiryShapeLineKind[];
  status: "proposed" | "accepted" | "rejected";
  createdAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
}

export interface InquiryFieldDefinition {
  id: string;
  label: string;
  kind: InquiryFieldKind;
  component: Extract<InquiryComponent, `${string}_field`>;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface InquiryFormDefinition {
  component: "form";
  id: string;
  title: string;
  intro: string;
  fields: InquiryFieldDefinition[];
  disclosure: "Strelva";
}

export interface InquiryRecordDefinition {
  component: "record_list" | "record_detail";
  type: "inquiry";
  singularLabel: string;
  pluralLabel: string;
  fields: InquiryFieldDefinition[];
}

export interface InquiryRoutingRule {
  component: "routing_rule";
  id: string;
  sentence: string;
  destination: string;
  channel: "email";
  withinMinutes: number;
}

export interface InquiryFollowUpRule {
  component: "follow_up_rule";
  id: string;
  sentence: string;
  afterMinutes: number;
  maxAttempts: number;
  messageTemplate: string;
  disclosure: "Strelva";
}

export interface InquiryConnectionBinding {
  id: "email";
  provider: "email";
  status: "connected" | "missing";
  consent: "explicit" | "missing";
  lastCheckedAt: string | null;
}

export interface InquiryCapabilityDefinition {
  kind: typeof INQUIRY_CAPABILITY_KIND;
  id: string;
  businessId: string;
  version: number;
  name: string;
  form: InquiryFormDefinition;
  record: InquiryRecordDefinition;
  routing: InquiryRoutingRule | null;
  followUp: InquiryFollowUpRule | null;
  connections: InquiryConnectionBinding[];
  createdAt: string;
  updatedAt: string;
}

export type InquiryPlanStepId = "form" | "record" | "routing" | "follow_up" | "rehearsal";

export interface InquiryPlanStep {
  id: InquiryPlanStepId;
  label: string;
  explanation: string;
  reversible: boolean;
  requiresApproval: boolean;
}

export interface InquiryPlan {
  version: number;
  steps: InquiryPlanStep[];
  acceptance: string[];
  createdAt: string;
}

export type DraftEditSource = "words" | "manual";

export interface InquiryDraftEdit {
  id: string;
  source: DraftEditSource;
  actorId: string;
  path: string;
  before: JsonValue | null;
  after: JsonValue | null;
  at: string;
}

export type ChangeItemKind = "form" | "record" | "routing_rule" | "follow_up_rule" | "connection";

export interface ChangeItem {
  id: string;
  kind: ChangeItemKind;
  path: string;
  before: JsonValue | null;
  after: JsonValue | null;
  sources: DraftEditSource[];
  editIds: string[];
}

export type ChangeReceiptStatus =
  | "draft"
  | "ready"
  | "publishing"
  | "published_unverified"
  | "published"
  | "undo_publishing"
  | "undone"
  | "undone_unverified"
  | "failed";

export interface PublishVerification {
  actorId: string;
  version: number;
  verified: boolean;
  checkedAt: string;
  evidence: string[];
}

export interface ChangeReceipt {
  id: string;
  businessId: string;
  requestId: string;
  capabilityId: string;
  baseVersion: number | null;
  targetVersion: number;
  status: ChangeReceiptStatus;
  summary: string;
  items: ChangeItem[];
  /** Undo only restores configuration. It never removes these records. */
  preservedInquiryIds: string[];
  undoOfChangeId: string | null;
  undoAvailable: boolean;
  actorIds: string[];
  createdAt: string;
  updatedAt: string;
  providerAcceptanceId: string | null;
  providerReceipt: JsonObject | null;
  verification: PublishVerification | null;
  failureReason: string | null;
}

export type ReceiptActor =
  | { kind: "person"; id: string; label?: string }
  | { kind: "customer"; id: string; label?: string }
  | { kind: "strelva"; id: string; label: "Strelva" }
  | { kind: "system"; id: string; label?: string };

export interface InquirySetupFacts {
  website: string | null;
  statements: Array<{ id: string; label: string; value: string | null; provenance: string | null; editable: boolean; confirmed: boolean }>;
  checks: Array<{ id: string; label: string; status: "passed" | "failed" | "unknown"; detail: string }>;
}

export interface ActionReceipt {
  setupFacts?: InquirySetupFacts;
  id: string;
  businessId: string;
  requestId: string | null;
  capabilityId: string | null;
  inquiryId: string | null;
  responsibilityId: string | null;
  actor: ReceiptActor;
  action: string;
  what: string;
  why: string;
  lookedAt: string[];
  outcome: "recorded" | "accepted" | "failed" | "blocked" | "proposed";
  evidence: string[];
  createdAt: string;
}

export interface PublishApproval {
  actorId: string;
  version: number;
  action: "make_live" | "undo";
  approvedAt: string;
  explicit: true;
}

export interface LivePublishInput {
  businessId: string;
  capabilityId: string;
  requestId: string;
  version: number;
  definition: InquiryCapabilityDefinition | null;
  receiptId: string;
  idempotencyKey: string;
}

/** Only a real host adapter may return an accepted provider outcome. */
export interface InquiryLivePublisher {
  publish(input: LivePublishInput): Promise<LivePublishResult>;
}

export type LivePublishResult =
  | { status: "accepted"; acceptanceId: string; acceptedAt: string; providerReceipt?: JsonObject }
  | { status: "failed"; failedAt: string; error: string; retryable: boolean };

export interface InquiryWork {
  id: string;
  businessId: string;
  capabilityId: string;
  actorId: string;
  /** The selected record that scoped a contextual request, when applicable. */
  context?: InquiryWorkContext;
  intent: string;
  shape: InquiryShapeProposal;
  plan: InquiryPlan | null;
  draft: InquiryCapabilityDefinition | null;
  state: InquiryRequestState;
  activeChangeId: string | null;
  publishApproval: PublishApproval | null;
  rehearsalScenarioIds: string[];
  rehearsalRunIds: string[];
  lastLiveChangeId: string | null;
  createdAt: string;
  updatedAt: string;
  failureReason: string | null;
}

export interface InquiryWorkContext {
  kind: "inquiry";
  inquiryId: string;
  capabilityId: string;
  capabilityVersion: number;
}

export interface InquiryCapabilityState {
  id: string;
  businessId: string;
  status: InquiryCapabilityStatus;
  live: InquiryCapabilityDefinition | null;
  previousLive: InquiryCapabilityDefinition | null;
  activeRequestId: string | null;
  updatedAt: string;
}

export interface RehearsalScenario {
  id: string;
  businessId: string;
  capabilityId: string;
  name: string;
  customerFields: Record<string, InquiryFieldValue>;
  createdAt: string;
}

export interface AddRehearsalScenarioInput {
  actorId: string;
  name?: string;
  customerFields?: Record<string, InquiryFieldValue>;
  now?: string;
}

export interface RunRehearsalInput {
  scenarioId?: string;
  now?: string;
  /** Internal batching flag; callers normally leave this unset. */
  emit?: boolean;
}

export type RehearsalCheckStatus = "passed" | "failed" | "skipped";

export interface RehearsalCheck {
  id: string;
  label: string;
  status: RehearsalCheckStatus;
  detail: string;
}

export interface RehearsalRun {
  id: string;
  scenarioId: string;
  requestId: string;
  businessId: string;
  capabilityId: string;
  definitionVersion: number;
  mode: "rehearsal";
  checks: RehearsalCheck[];
  passed: boolean;
  passedCount: number;
  totalCount: number;
  fastForwardMinutes: number;
  syntheticRecord: { id: string; persisted: false; fields: Record<string, InquiryFieldValue> } | null;
  testInbox: Array<{ to: string; subject: string; body: string; disclosedAs: "Strelva" }>;
  outboundMessages: Array<{ to: string; body: string; disclosedAs: "Strelva" }>;
  /** Computed from the rehearsal's local-only artifacts, never asserted by a provider. */
  externalWritesBlocked: boolean;
  externalWriteEvidence: string[];
  nothingLive: true;
  ranAt: string;
}

export type InquiryRecordStatus = "new" | "assigned" | "follow_up_pending" | "handled" | "blocked";

export interface InquiryRecord {
  id: string;
  businessId: string;
  capabilityId: string;
  capabilityVersion: number;
  fields: Record<string, InquiryFieldValue>;
  status: InquiryRecordStatus;
  /** Current staff owner when the record was explicitly assigned. */
  assigneeId?: string | null;
  receivedAt: string;
  timelineEventIds: string[];
  createdReceiptId: string;
}

export type InquiryTimelineEventType =
  | "received"
  | "record_created"
  | "routed"
  | "notification_accepted"
  | "notification_bounced"
  | "follow_up_scheduled"
  | "follow_up_sent"
  | "follow_up_blocked"
  | "status_changed"
  | "question"
  | "note";

export interface InquiryTimelineEvent {
  id: string;
  inquiryId: string;
  businessId: string;
  capabilityId: string;
  type: InquiryTimelineEventType;
  actor: ReceiptActor;
  summary: string;
  at: string;
  receiptId: string | null;
  causedByEventId: string | null;
  outcome: "recorded" | "accepted" | "failed" | "blocked";
  evidence: string[];
}

export interface WhyFixProposal {
  kind: "change";
  title: string;
  reason: string;
  targetPath: string;
  suggestedValue: JsonValue | null;
}

export interface WhyStoryStep {
  eventId: string | null;
  label: string;
  sentence: string;
  status: "ok" | "broken" | "blocked" | "missing";
}

export interface WhyResult {
  inquiryId: string;
  summary: string;
  steps: WhyStoryStep[];
  brokenStep: WhyStoryStep | null;
  fix: WhyFixProposal | null;
}

export type ResponsibilityTrust = "supervised" | "trusted";
export type ResponsibilityStatus = "active" | "paused";
export type ResponsibilityAction =
  | "reply"
  | "ask_question"
  | "assign"
  | "send_message"
  | "schedule_follow_up"
  | "change_rule"
  | "publish"
  | "delete"
  | "change_permissions"
  | "charge"
  | "quote_price"
  | "promise_date";

export interface ResponsibilityBudget {
  dailyMessages: number;
  timezone: string;
}

export interface ResponsibilityHours {
  timezone: string;
  days: number[];
  start: string;
  end: string;
}

export interface ResponsibilityNeverClause {
  action: ResponsibilityAction;
  sentence: string;
}

export interface ResponsibilityApprovalClause {
  action: ResponsibilityAction;
  sentence: string;
}

export interface ResponsibilityEscalation {
  primary: string;
  secondary: string | null;
}

export interface ResponsibilityPolicy {
  id: string;
  businessId: string;
  capabilityId: string;
  title: string;
  scope: string;
  allowedActions: ResponsibilityAction[];
  /** Explicit standing permission for trusted actions inside the scope. */
  preAuthorizedActions: ResponsibilityAction[];
  never: ResponsibilityNeverClause[];
  approval: ResponsibilityApprovalClause[];
  budget: ResponsibilityBudget;
  escalation: ResponsibilityEscalation;
  voice: string;
  hours: ResponsibilityHours;
  trust: ResponsibilityTrust;
  status: ResponsibilityStatus;
  sponsorId: string;
  cleanReceiptCount: number;
  failedReceiptCount: number;
  requiredCleanReceipts: number;
  trustChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ResponsibilityDecision = "allow" | "approval_required" | "block";

export interface ResponsibilityEvaluation {
  decision: ResponsibilityDecision;
  action: ResponsibilityAction;
  reason: string;
  clause: string | null;
  disclosedAs: "Strelva" | null;
}

export interface ResponsibilityActionReceipt {
  id: string;
  idempotencyKey: string | null;
  responsibilityId: string;
  businessId: string;
  action: ResponsibilityAction;
  actorId: string;
  status: "proposed" | "accepted" | "failed" | "blocked";
  evaluation: ResponsibilityEvaluation;
  what: string;
  why: string;
  lookedAt: string[];
  outcomeEvidence: string[];
  createdAt: string;
}

export interface ResponsibilityActionInput {
  responsibilityId: string;
  action: ResponsibilityAction;
  actorId: string;
  at?: string;
  what: string;
  why: string;
  lookedAt?: string[];
  approvedBy?: string;
  /** Stable key supplied by the adapter so a replay cannot create another action. */
  idempotencyKey?: string;
  /** Supplied only after an adapter reports what happened. */
  outcome?: "accepted" | "failed";
  outcomeEvidence?: string[];
  messageBody?: string;
}

export interface InquiryEngineState {
  stateVersion: typeof INQUIRY_ENGINE_VERSION;
  requests: InquiryWork[];
  capabilities: InquiryCapabilityState[];
  changes: ChangeReceipt[];
  actionReceipts: ActionReceipt[];
  rehearsalScenarios: RehearsalScenario[];
  rehearsalRuns: RehearsalRun[];
  inquiries: InquiryRecord[];
  timeline: InquiryTimelineEvent[];
  responsibilities: ResponsibilityPolicy[];
  responsibilityReceipts: ResponsibilityActionReceipt[];
}

export interface InquiryEngineOptions {
  businessId: string;
  state?: InquiryEngineState;
  now?: () => string;
  idFactory?: (prefix: string) => string;
  /** Persistence only. This callback is not an authorization boundary. */
  onStateChange?: (state: InquiryEngineState) => void;
  livePublisher?: InquiryLivePublisher;
}

export interface StartInquiryWorkInput {
  actorId: string;
  intent: string;
  requestId?: string;
  capabilityId?: string;
  title?: string;
  destination?: string;
  followUpAfterMinutes?: number;
  emailConnection?: Pick<InquiryConnectionBinding, "status" | "consent" | "lastCheckedAt">;
  now?: string;
}

export interface ContextualInquiryRequestInput {
  actorId: string;
  inquiryId: string;
  intent: string;
  now?: string;
}

export interface InquiryRuleUpdateInput {
  actorId: string;
  routing?: {
    destination?: string;
    withinMinutes?: number;
  } | null;
  followUp?: {
    afterMinutes?: number;
    maxAttempts?: number;
    messageTemplate?: string;
  } | null;
  source?: DraftEditSource;
  now?: string;
}

export interface AcceptShapeInput {
  actorId: string;
  selectedLineIds?: InquiryShapeLineKind[];
  now?: string;
}

export interface DraftEditInput {
  actorId: string;
  source: DraftEditSource;
  path: string;
  after: JsonValue | null;
  expectedBefore?: JsonValue | null;
  now?: string;
}

export interface DraftEditResult {
  work: InquiryWork;
  receipt: ChangeReceipt;
  edit: InquiryDraftEdit;
}

export interface PublishReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PublishReadiness {
  requestId: string;
  capabilityId: string;
  exactVersion: number | null;
  requestedVersion: number | null;
  ready: boolean;
  checks: PublishReadinessCheck[];
  reasons: string[];
}

export interface UndoPlan {
  requestId: string;
  capabilityId: string;
  undoOfChangeId: string;
  fromVersion: number;
  toVersion: number | null;
  receipt: ChangeReceipt;
  preservesInquiryIds: string[];
}

export interface PublishResult {
  work: InquiryWork;
  receipt: ChangeReceipt;
  provider: LivePublishResult;
  retryable: boolean;
}

export interface ApprovePublishInput {
  actorId: string;
  version?: number;
  now?: string;
}

export interface PublishInput {
  actorId: string;
  version?: number;
  /** This literal is required so a route cannot accidentally auto-publish. */
  explicit: true;
  now?: string;
}

export interface RecordPublishVerificationInput {
  actorId: string;
  version: number;
  verified: boolean;
  evidence: string[];
  now?: string;
}

export interface BulkInquiryUpdate {
  inquiryIds: string[];
  actorId: string;
  status: Extract<InquiryRecordStatus, "assigned" | "handled" | "blocked">;
  assigneeId?: string | null;
  why: string;
  now?: string;
}

export interface ResponsibilityCreateInput {
  actorId: string;
  capabilityId: string;
  title: string;
  scope: string;
  allowedActions: ResponsibilityAction[];
  preAuthorizedActions?: ResponsibilityAction[];
  never?: ResponsibilityNeverClause[];
  approval?: ResponsibilityApprovalClause[];
  budget?: Partial<ResponsibilityBudget>;
  escalation: ResponsibilityEscalation;
  voice?: string;
  hours?: Partial<ResponsibilityHours>;
  trust?: ResponsibilityTrust;
  requiredCleanReceipts?: number;
  now?: string;
}

export interface ResponsibilityUpdateInput {
  actorId: string;
  title?: string;
  scope?: string;
  allowedActions?: ResponsibilityAction[];
  preAuthorizedActions?: ResponsibilityAction[];
  never?: ResponsibilityNeverClause[];
  approval?: ResponsibilityApprovalClause[];
  budget?: Partial<ResponsibilityBudget>;
  escalation?: ResponsibilityEscalation;
  voice?: string;
  hours?: Partial<ResponsibilityHours>;
  requiredCleanReceipts?: number;
  now?: string;
}

export interface PatternCopyInput {
  sourceCapabilityId: string;
  /** Optional definition supplied by an authorized agency source read. It contains configuration only, never source secrets or history. */
  sourceDefinition?: InquiryCapabilityDefinition;
  sourceBusinessId?: string;
  targetBusinessId: string;
  targetActorId: string;
  requestId?: string;
  destination?: string;
  emailConnection?: Pick<InquiryConnectionBinding, "status" | "consent" | "lastCheckedAt">;
  now?: string;
}

export interface ReceiveInquiryInput {
  capabilityId?: string;
  /** The public form must bind its submission to the exact definition it rendered. */
  expectedCapabilityVersion: number;
  fields: Record<string, InquiryFieldValue>;
  receivedAt?: string;
  inquiryId?: string;
}

export interface RecordInquiryEventInput {
  type: InquiryTimelineEventType;
  actor: ReceiptActor;
  summary: string;
  at?: string;
  receiptId?: string | null;
  causedByEventId?: string | null;
  outcome?: "recorded" | "accepted" | "failed" | "blocked";
  evidence?: string[];
  /** Required for follow-up messages so the customer sees who sent them. */
  messageBody?: string;
}

/** The shared connection projection is owned by the connection adapter. */
export type { InquiryConnectionView } from "./connections";

export type { InquiryAudience, InquirySurfaceAction, InquirySurfaceAdapter, InquirySurfaceResult, InquirySurfaceSnapshot } from "./surface-contracts";

export type { InquiryAttentionSummary, InquiryPatternSummary, InquiryPortfolio } from "./portfolio";
