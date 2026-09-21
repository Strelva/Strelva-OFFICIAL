import type {
  AcceptShapeInput,
  AddRehearsalScenarioInput,
  ActionReceipt,
  ApprovePublishInput,
  BulkInquiryUpdate,
  ChangeReceipt,
  ContextualInquiryRequestInput,
  DraftEditInput,
  DraftEditResult,
  InquiryCapabilityDefinition,
  InquiryCapabilityState,
  InquiryConnectionBinding,
  InquiryEngineOptions,
  InquiryEngineState,
  InquiryPlan,
  InquiryRecord,
  InquiryRuleUpdateInput,
  InquiryTimelineEvent,
  InquiryWork,
  JsonObject,
  JsonValue,
  PublishReadiness,
  ReceiveInquiryInput,
  RecordPublishVerificationInput,
  RehearsalRun,
  RehearsalScenario,
  RecordInquiryEventInput,
  ResponsibilityAction,
  ResponsibilityActionInput,
  ResponsibilityActionReceipt,
  ResponsibilityEvaluation,
  ResponsibilityPolicy,
  ResponsibilityCreateInput,
  ResponsibilityUpdateInput,
  StartInquiryWorkInput,
  RunRehearsalInput,
  PatternCopyInput,
  PublishInput,
  PublishResult,
  UndoPlan,
  WhyResult,
} from "./contracts";
import {
  INQUIRY_ENGINE_VERSION,
} from "./contracts";
import {
  actorFor,
  assertEditableDraftPath,
  buildInquiryDefinition,
  changeItemsForDefinition,
  changeSummary,
  clone,
  componentForPath,
  defaultIdFactory,
  emptyState,
  ensureActor,
  equal,
  fail,
  formatDuration,
  jsonValue,
  pathSegments,
  planFor,
  proposeInquiryShape,
  readPath,
  selectedLineSet,
  text,
  timestamp,
  writePath,
} from "./inquiry-engine-support";
export { InquiryEngineError } from "./inquiry-engine-support";
export type { BuildDefinitionInput, ShapeProposalInput } from "./inquiry-engine-support";
import {
  addRehearsalScenario as addRehearsalScenarioOperation,
  approvePublish as approvePublishOperation,
  explainWhy as explainWhyOperation,
  getPublishReadiness as getPublishReadinessOperation,
  prepareUndo as prepareUndoOperation,
  publish as publishOperation,
  receiveInquiry as receiveInquiryOperation,
  recordInquiryEvent as recordInquiryEventOperation,
  recordPublishVerification as recordPublishVerificationOperation,
  runRehearsal as runRehearsalOperation,
  runSavedRehearsals as runSavedRehearsalsOperation,
  undo as undoOperation,
  ensureDefinition,
} from "./inquiry-engine-operations";
import {
  createResponsibility as createResponsibilityOperation,
  evaluateResponsibilityAction as evaluateResponsibilityActionOperation,
  pauseResponsibility as pauseResponsibilityOperation,
  promoteResponsibility as promoteResponsibilityOperation,
  recordResponsibilityAction as recordResponsibilityActionOperation,
  resumeResponsibility as resumeResponsibilityOperation,
  updateResponsibility as updateResponsibilityOperation,
} from "./inquiry-engine-responsibility";
import {
  bulkUpdateInquiries as bulkUpdateInquiriesOperation,
  copyPattern as copyPatternOperation,
  undoBulkChange as undoBulkChangeOperation,
} from "./inquiry-engine-pattern";

/** A typed error that callers can surface as a sentence rather than a code. */
export class InquiryEngine {
  readonly businessId: string;
  private readonly nowFn: () => string;
  private readonly ids: (prefix: string) => string;
  private readonly onStateChange?: (state: InquiryEngineState) => void;
  private readonly livePublisher?: InquiryEngineOptions["livePublisher"];
  private state: InquiryEngineState;
  private suppressEmit = 0;

  constructor(options: InquiryEngineOptions) {
    this.businessId = text(options.businessId, "business", 200);
    this.nowFn = options.now ?? (() => new Date().toISOString());
    this.ids = options.idFactory ?? defaultIdFactory();
    this.onStateChange = options.onStateChange;
    this.livePublisher = options.livePublisher;
    const supplied = options.state ? clone(options.state) : emptyState();
    if (supplied.stateVersion !== INQUIRY_ENGINE_VERSION) fail("invalid_state", "This inquiry state version is not supported.");
    this.assertStateBusiness(supplied);
    this.state = supplied;
  }

  private assertStateBusiness(state: InquiryEngineState): void {
    const values: Array<{ businessId?: string }> = [
      ...state.requests,
      ...state.capabilities,
      ...state.changes,
      ...state.actionReceipts,
      ...state.rehearsalScenarios,
      ...state.rehearsalRuns,
      ...state.inquiries,
      ...state.timeline,
      ...state.responsibilities,
      ...state.responsibilityReceipts,
    ];
    for (const value of values) {
      if (value.businessId !== undefined && value.businessId !== this.businessId) {
        fail("wrong_business", "This record belongs to another business.");
      }
    }
    const capabilities = new Map(state.capabilities.map((capability) => [capability.id, capability]));
    const requests = new Map(state.requests.map((request) => [request.id, request]));
    const changes = new Map(state.changes.map((change) => [change.id, change]));
    const inquiries = new Map(state.inquiries.map((inquiry) => [inquiry.id, inquiry]));
    const responsibilities = new Map(state.responsibilities.map((policy) => [policy.id, policy]));
    const assertDefinitionFor = (definition: InquiryCapabilityDefinition | null, label: string, expectedId?: string): void => {
      if (!definition) return;
      try {
        ensureDefinition(definition, this.businessId);
      } catch (error) {
        fail("invalid_state", `${label} is invalid: ${error instanceof Error ? error.message : "unsupported definition"}`);
      }
      if (expectedId && definition.id !== expectedId) fail("invalid_state", `${label} points at the wrong capability.`);
    };
    for (const capability of state.capabilities) {
      assertDefinitionFor(capability.live, "Live capability", capability.id);
      assertDefinitionFor(capability.previousLive, "Previous live capability", capability.id);
      if (capability.live && capability.previousLive && capability.previousLive.version >= capability.live.version) fail("invalid_state", "Previous live capability versions must precede the current version.");
      if (capability.activeRequestId && !requests.has(capability.activeRequestId)) fail("invalid_state", "Capability active work reference is missing.");
    }
    for (const work of state.requests) {
      if (work.shape.businessId !== this.businessId || work.shape.requestId !== work.id) fail("invalid_state", "Inquiry work shape identity is invalid.");
      if (!capabilities.has(work.capabilityId)) fail("invalid_state", "Inquiry work points at a missing capability.");
      if (work.context) {
        const context = work.context;
        const inquiry = inquiries.get(context.inquiryId);
        if (context.kind !== "inquiry" || !inquiry || inquiry.businessId !== this.businessId || inquiry.capabilityId !== context.capabilityId || inquiry.capabilityVersion !== context.capabilityVersion) {
          fail("invalid_state", "Inquiry work contextual reference is invalid.");
        }
      }
      if (work.draft) assertDefinitionFor(work.draft, "Inquiry work draft", work.capabilityId);
      if (work.activeChangeId && !changes.has(work.activeChangeId)) fail("invalid_state", "Inquiry work change reference is missing.");
      if (work.lastLiveChangeId && !changes.has(work.lastLiveChangeId)) fail("invalid_state", "Inquiry work live receipt reference is missing.");
      for (const scenarioId of work.rehearsalScenarioIds) {
        const scenario = state.rehearsalScenarios.find((item) => item.id === scenarioId);
        if (!scenario || scenario.businessId !== this.businessId || scenario.capabilityId !== work.capabilityId) fail("invalid_state", "Inquiry work rehearsal scenario reference is invalid.");
      }
    }
    for (const change of state.changes) {
      if (!capabilities.has(change.capabilityId)) fail("invalid_state", "Change receipt points at a missing capability.");
      if (!change.requestId.startsWith("bulk:") && !requests.has(change.requestId)) fail("invalid_state", "Change receipt work reference is missing.");
      if (change.undoOfChangeId && !changes.has(change.undoOfChangeId)) fail("invalid_state", "Undo receipt source reference is missing.");
      if (!Number.isInteger(change.targetVersion) || change.targetVersion < 1) fail("invalid_state", "Change receipt version is invalid.");
    }
    for (const scenario of state.rehearsalScenarios) {
      if (scenario.businessId !== this.businessId || !capabilities.has(scenario.capabilityId)) fail("invalid_state", "Rehearsal scenario identity is invalid.");
    }
    for (const run of state.rehearsalRuns) {
      if (run.businessId !== this.businessId || !requests.has(run.requestId) || !capabilities.has(run.capabilityId) || run.totalCount !== 8 || run.passedCount > run.totalCount) fail("invalid_state", "Rehearsal run identity or checks are invalid.");
      if (!run.nothingLive || !run.externalWritesBlocked) fail("invalid_state", "A rehearsal must prove that nothing is live.");
    }
    for (const inquiry of state.inquiries) {
      if (inquiry.businessId !== this.businessId || !capabilities.has(inquiry.capabilityId) || !Number.isInteger(inquiry.capabilityVersion) || inquiry.capabilityVersion < 1) fail("invalid_state", "Inquiry record identity is invalid.");
    }
    for (const event of state.timeline) {
      const inquiry = inquiries.get(event.inquiryId);
      if (event.businessId !== this.businessId || !inquiry || inquiry.capabilityId !== event.capabilityId) fail("invalid_state", "Inquiry timeline identity is invalid.");
      if (event.causedByEventId && !inquiry.timelineEventIds.includes(event.causedByEventId)) fail("invalid_state", "Inquiry timeline causal reference is invalid.");
    }
    for (const policy of state.responsibilities) if (!capabilities.has(policy.capabilityId)) fail("invalid_state", "Responsibility points at a missing capability.");
    for (const receipt of state.responsibilityReceipts) if (!responsibilities.has(receipt.responsibilityId)) fail("invalid_state", "Responsibility receipt points at a missing policy.");
  }

  private emit(): void {
    if (this.suppressEmit > 0) return;
    this.onStateChange?.(clone(this.state));
  }

  /** Snapshot suitable for a repository adapter. It contains no provider secrets. */
  snapshot(): InquiryEngineState {
    return clone(this.state);
  }

  getWork(requestId: string): InquiryWork {
    return clone(this.request(requestId));
  }

  listWorks(): InquiryWork[] {
    return clone(this.state.requests);
  }

  getCapability(capabilityId: string): InquiryCapabilityState {
    return clone(this.capability(capabilityId));
  }

  listChanges(capabilityId?: string): ChangeReceipt[] {
    return clone(this.state.changes.filter((change) => !capabilityId || change.capabilityId === capabilityId));
  }

  listInquiryRecords(capabilityId?: string): InquiryRecord[] {
    return clone(this.state.inquiries.filter((record) => !capabilityId || record.capabilityId === capabilityId));
  }

  listTimeline(inquiryId: string): InquiryTimelineEvent[] {
    const inquiry = this.inquiry(inquiryId);
    const ids = new Set(inquiry.timelineEventIds);
    return clone(this.state.timeline.filter((event) => ids.has(event.id)).sort((left, right) => Date.parse(left.at) - Date.parse(right.at)));
  }

  start(input: StartInquiryWorkInput): InquiryWork {
    const actorId = ensureActor(input.actorId);
    const intent = text(input.intent, "request", 2_000);
    const now = timestamp(input.now, this.nowFn);
    const requestId = input.requestId?.trim() || this.ids("request");
    if (this.state.requests.some((request) => request.id === requestId)) fail("duplicate_request", "That request already exists.");
    const existingCapability = input.capabilityId ? this.state.capabilities.find((item) => item.id === input.capabilityId) : undefined;
    if (input.capabilityId && !existingCapability) fail("missing_capability", "That capability is unavailable in this business.");
    if (existingCapability?.activeRequestId) fail("request_in_progress", "That capability already has work in progress.");
    const capabilityId = existingCapability?.id ?? input.capabilityId?.trim() ?? this.ids("capability");
    const shape = proposeInquiryShape({
      businessId: this.businessId,
      requestId,
      intent,
      idFactory: this.ids,
      destination: input.destination,
      followUpAfterMinutes: input.followUpAfterMinutes,
      emailConnection: input.emailConnection,
      title: input.title,
      now,
    });
    const work: InquiryWork = {
      id: requestId,
      businessId: this.businessId,
      capabilityId,
      actorId,
      intent,
      shape,
      plan: null,
      draft: null,
      state: "shaped",
      activeChangeId: null,
      publishApproval: null,
      rehearsalScenarioIds: [],
      rehearsalRunIds: [],
      lastLiveChangeId: null,
      createdAt: now,
      updatedAt: now,
      failureReason: null,
    };
    this.state.requests.unshift(work);
    if (!existingCapability) {
      this.state.capabilities.unshift({
        id: capabilityId,
        businessId: this.businessId,
        status: "draft",
        live: null,
        previousLive: null,
        activeRequestId: requestId,
        updatedAt: now,
      });
    } else {
      existingCapability.activeRequestId = requestId;
      existingCapability.status = existingCapability.live ? "live" : "draft";
      existingCapability.updatedAt = now;
    }
    this.emit();
    return clone(work);
  }

  /** Start a new, explicitly record-scoped request from the Inspector. */
  startContextualRequest(input: ContextualInquiryRequestInput): InquiryWork {
    const inquiry = this.inquiry(input.inquiryId);
    const sourceCapability = this.capability(inquiry.capabilityId);
    const sourceDefinitions = [
      sourceCapability.live,
      sourceCapability.previousLive,
      ...this.state.requests
        .filter((work) => work.capabilityId === inquiry.capabilityId && work.draft)
        .map((work) => work.draft),
    ].filter((definition): definition is InquiryCapabilityDefinition => Boolean(definition));
    const sourceDefinition = sourceDefinitions.find((definition) => definition.version === inquiry.capabilityVersion) ?? sourceDefinitions[0] ?? null;
    const sourceConnection = sourceDefinition?.connections.find((connection) => connection.id === "email");
    const work = this.start({
      actorId: input.actorId,
      intent: input.intent,
      title: sourceDefinition?.form.title,
      destination: sourceDefinition?.routing?.destination,
      followUpAfterMinutes: sourceDefinition?.followUp?.afterMinutes,
      emailConnection: sourceConnection ? {
        status: sourceConnection.status,
        consent: sourceConnection.consent,
        lastCheckedAt: sourceConnection.lastCheckedAt,
      } : undefined,
      now: input.now,
    });
    const stored = this.request(work.id);
    stored.context = {
      kind: "inquiry",
      inquiryId: inquiry.id,
      capabilityId: inquiry.capabilityId,
      capabilityVersion: inquiry.capabilityVersion,
    };
    const now = stored.createdAt;
    this.addActionReceipt({
      businessId: this.businessId,
      requestId: stored.id,
      capabilityId: stored.capabilityId,
      inquiryId: inquiry.id,
      responsibilityId: null,
      actor: actorFor(stored.actorId),
      action: "start_contextual_request",
      what: `Started work from inquiry ${inquiry.id}.`,
      why: "The Inspector keeps the next request attached to the selected inquiry and its capability version.",
      lookedAt: [inquiry.id, `capability ${inquiry.capabilityId} version ${inquiry.capabilityVersion}`],
      outcome: "recorded",
      evidence: ["selected inquiry record", "selected capability version"],
      createdAt: now,
    });
    this.emit();
    return clone(stored);
  }

  acceptShape(requestId: string, input: AcceptShapeInput): InquiryWork {
    const work = this.request(requestId);
    const actorId = ensureActor(input.actorId);
    const now = timestamp(input.now, this.nowFn);
    if (work.shape.status === "accepted" && work.draft) return clone(work);
    const selected = selectedLineSet(input.selectedLineIds, work.shape);
    work.shape.lines = work.shape.lines.map((line) => ({ ...line, selected: selected.includes(line.id) }));
    work.shape.selectedLineIds = selected;
    work.shape.status = "accepted";
    work.shape.acceptedAt = now;
    work.shape.acceptedBy = actorId;
    const capability = this.capability(work.capabilityId);
    const version = (capability.live?.version ?? 0) + 1;
    const draft = buildInquiryDefinition({
      capabilityId: work.capabilityId,
      businessId: this.businessId,
      version,
      intent: work.intent,
      title: work.shape.title,
      selectedLineIds: selected,
      destination: work.shape.defaults.destination,
      followUpAfterMinutes: work.shape.defaults.followUpAfterMinutes,
      emailConnection: work.shape.defaults.emailConnection,
      now,
    });
    work.draft = draft;
    work.plan = planFor(work.shape, version, now);
    work.state = "planned";
    work.updatedAt = now;
    work.publishApproval = null;
    const items = changeItemsForDefinition(draft, capability.live, this.ids);
    const receipt: ChangeReceipt = {
      id: this.ids("change"),
      businessId: this.businessId,
      requestId: work.id,
      capabilityId: work.capabilityId,
      baseVersion: capability.live?.version ?? null,
      targetVersion: version,
      status: "draft",
      summary: changeSummary(items),
      items,
      preservedInquiryIds: this.state.inquiries.filter((record) => record.capabilityId === work.capabilityId).map((record) => record.id),
      undoOfChangeId: null,
      undoAvailable: false,
      actorIds: [actorId],
      createdAt: now,
      updatedAt: now,
      providerAcceptanceId: null,
      providerReceipt: null,
      verification: null,
      failureReason: null,
    };
    this.state.changes.unshift(receipt);
    work.activeChangeId = receipt.id;
    this.addActionReceipt({
      businessId: this.businessId,
      requestId: work.id,
      capabilityId: work.capabilityId,
      inquiryId: null,
      responsibilityId: null,
      actor: actorFor(actorId),
      action: "accept_shape",
      what: `Accepted the ${work.shape.title} shape.`,
      why: "The selected shape is the explicit boundary for this capability.",
      lookedAt: work.shape.lines.filter((line) => line.selected).map((line) => line.touches),
      outcome: "recorded",
      evidence: ["shape proposal", `shape version ${work.shape.version}`],
      createdAt: now,
    });
    capability.updatedAt = now;
    this.emit();
    return clone(work);
  }

  buildPlan(requestId: string): InquiryPlan {
    const work = this.request(requestId);
    if (!work.draft || work.shape.status !== "accepted") fail("shape_required", "Accept the shape before Strelva prepares the plan.");
    if (!work.plan || work.plan.version !== work.draft.version) {
      const now = timestamp(undefined, this.nowFn);
      work.plan = planFor(work.shape, work.draft.version, now);
      work.updatedAt = now;
      this.emit();
    }
    return clone(work.plan);
  }

  private applyDraftEditInternal(requestId: string, input: DraftEditInput, allowConnection = false): DraftEditResult {
    const work = this.request(requestId);
    const actorId = ensureActor(input.actorId);
    const now = timestamp(input.now, this.nowFn);
    if (!work.draft || !work.activeChangeId) fail("draft_required", "Accept the shape before editing the preview.");
    if (["publishing", "live_unverified", "cancelled"].includes(work.state)) fail("draft_closed", "This work is already at the live boundary.");
    const startsNextChange = work.state === "handled";
    const path = pathSegments(input.path).join(".");
    assertEditableDraftPath(path, allowConnection);
    const before = readPath(work.draft, path);
    const componentPath = path.split(".")[0] ?? path;
    const componentBefore = readPath(work.draft, componentPath);
    if (input.expectedBefore !== undefined && !equal(before, input.expectedBefore)) fail("stale_edit", "That preview changed. Reload it before applying this edit.");
    const after = jsonValue(input.after, path);
    const draft = clone(work.draft) as unknown as JsonObject;
    writePath(draft, path, after);
    const typedDraft = draft as unknown as InquiryCapabilityDefinition;
    typedDraft.version = work.draft.version + 1;
    typedDraft.updatedAt = now;
    this.syncRuleSentences(typedDraft);
    try {
      ensureDefinition(typedDraft, this.businessId);
    } catch (error) {
      fail("invalid_draft", error instanceof Error ? error.message : "The edited inquiry definition is invalid.");
    }
    if (startsNextChange) {
      const previous = this.change(work.activeChangeId);
      const receipt: ChangeReceipt = {
        ...clone(previous), id: this.ids("change"), items: [],
        baseVersion: this.capability(work.capabilityId).live?.version ?? null,
        targetVersion: typedDraft.version, status: "draft", summary: "Draft change",
        undoOfChangeId: null, undoAvailable: false, actorIds: [actorId],
        providerAcceptanceId: null, providerReceipt: null, verification: null,
        failureReason: null, createdAt: now, updatedAt: now,
        preservedInquiryIds: this.state.inquiries.filter((record) => record.capabilityId === work.capabilityId).map((record) => record.id),
      };
      this.state.changes.unshift(receipt);
      work.activeChangeId = receipt.id;
    }
    work.draft = typedDraft;
    work.state = "editing";
    work.publishApproval = null;
    work.updatedAt = now;
    if (work.plan) work.plan.version = typedDraft.version;
    const edit = {
      id: this.ids("edit"),
      source: input.source,
      actorId,
      path,
      before,
      after,
      at: now,
    };
    const receipt = this.change(work.activeChangeId);
    const componentAfter = readPath(typedDraft, componentPath);
    const existing = receipt.items.find((item) => item.path === componentPath);
    if (existing) {
      existing.after = componentAfter;
      if (!existing.sources.includes(input.source)) existing.sources.push(input.source);
      existing.editIds.push(edit.id);
    } else {
      receipt.items.push({
        id: this.ids("change_item"),
        kind: componentForPath(componentPath),
        path: componentPath,
        before: componentBefore,
        after: componentAfter,
        sources: [input.source],
        editIds: [edit.id],
      });
    }
    receipt.targetVersion = typedDraft.version;
    receipt.summary = changeSummary(receipt.items);
    receipt.actorIds = [...new Set([...receipt.actorIds, actorId])];
    receipt.updatedAt = now;
    receipt.status = "draft";
    receipt.verification = null;
    this.autoRerunSavedRehearsals(work, now);
    this.emit();
    return { work: clone(work), receipt: clone(receipt), edit: clone(edit) };
  }

  applyDraftEdit(requestId: string, input: DraftEditInput): DraftEditResult {
    return this.applyDraftEditInternal(requestId, input);
  }

  applyDraftEdits(requestId: string, edits: readonly DraftEditInput[]): DraftEditResult {
    if (edits.length === 0) fail("invalid_input", "Add at least one preview edit.");
    const checkpoint = clone(this.state);
    let result: DraftEditResult | null = null;
    this.suppressEmit += 1;
    try {
      for (const edit of edits) result = this.applyDraftEditInternal(requestId, edit);
    } catch (error) {
      this.state = checkpoint;
      throw error;
    } finally {
      this.suppressEmit -= 1;
    }
    this.emit();
    return result!;
  }

  /** Update routing and follow-up through the same versioned draft/receipt path. */
  updateInquiryRules(requestId: string, input: InquiryRuleUpdateInput): DraftEditResult {
    const work = this.request(requestId);
    if (!work.draft) fail("draft_required", "Accept the shape before editing inquiry rules.");
    const edits: DraftEditInput[] = [];
    const source = input.source ?? "manual";
    const boundedMinutes = (value: number, label: string): number => {
      if (!Number.isSafeInteger(value) || value < 1 || value > 365 * 24 * 60) fail("invalid_input", `${label} must be a whole number from 1 minute to 365 days.`);
      return value;
    };
    const boundedAttempts = (value: number): number => {
      if (!Number.isSafeInteger(value) || value < 1 || value > 100) fail("invalid_input", "Follow-up attempts must be a whole number from 1 to 100.");
      return value;
    };
    const boundedText = (value: string, label: string, max: number): string => {
      if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail("invalid_input", `Keep ${label} within ${max} characters.`);
      return value.trim();
    };
    const push = (path: string, after: JsonValue | null, before: JsonValue | undefined = readPath(work.draft!, path)) => {
      if (!equal(before, after)) edits.push({ actorId: input.actorId, source, path, after, expectedBefore: before, now: input.now });
    };
    if (input.routing !== undefined) {
      if (input.routing === null) {
        push("routing", null);
      } else if (work.draft.routing) {
        if (input.routing.destination !== undefined) push("routing.destination", boundedText(input.routing.destination, "routing destination", 200), work.draft.routing.destination);
        if (input.routing.withinMinutes !== undefined) push("routing.withinMinutes", boundedMinutes(input.routing.withinMinutes, "Routing delay"), work.draft.routing.withinMinutes);
      } else {
        if (!work.shape.selectedLineIds.includes("routing")) fail("shape_required", "Add routing back through a new Shape before editing its rule.");
        push("routing", {
          component: "routing_rule",
          id: `${work.capabilityId}:routing`,
          sentence: "",
          destination: input.routing.destination === undefined ? "" : boundedText(input.routing.destination, "routing destination", 200),
          channel: "email",
          withinMinutes: boundedMinutes(input.routing.withinMinutes ?? 10, "Routing delay"),
        });
      }
    }
    if (input.followUp !== undefined) {
      if (input.followUp === null) {
        push("followUp", null);
      } else if (work.draft.followUp) {
        if (input.followUp.afterMinutes !== undefined) push("followUp.afterMinutes", boundedMinutes(input.followUp.afterMinutes, "Follow-up delay"), work.draft.followUp.afterMinutes);
        if (input.followUp.maxAttempts !== undefined) push("followUp.maxAttempts", boundedAttempts(input.followUp.maxAttempts), work.draft.followUp.maxAttempts);
        if (input.followUp.messageTemplate !== undefined) push("followUp.messageTemplate", boundedText(input.followUp.messageTemplate, "follow-up message", 5_000), work.draft.followUp.messageTemplate);
      } else {
        if (!work.shape.selectedLineIds.includes("follow_up")) fail("shape_required", "Add follow-up back through a new Shape before editing its rule.");
        push("followUp", {
          component: "follow_up_rule",
          id: `${work.capabilityId}:follow-up`,
          sentence: "",
          afterMinutes: boundedMinutes(input.followUp.afterMinutes ?? 24 * 60, "Follow-up delay"),
          maxAttempts: boundedAttempts(input.followUp.maxAttempts ?? 1),
          messageTemplate: input.followUp.messageTemplate === undefined ? "Hello {name}, this is Strelva following up on your request. Is there anything else we can help with?" : boundedText(input.followUp.messageTemplate, "follow-up message", 5_000),
          disclosure: "Strelva",
        });
      }
    }
    if (edits.length === 0) fail("invalid_input", "Change at least one inquiry rule.");
    return this.applyDraftEdits(requestId, edits);
  }

  /** Update the explicitly consented email state as one versioned change. */
  setEmailConnection(
    requestId: string,
    input: { actorId: string; status: InquiryConnectionBinding["status"]; consent: InquiryConnectionBinding["consent"]; lastCheckedAt?: string | null; now?: string },
  ): DraftEditResult {
    const status = input.status;
    const consent = input.consent;
    if (status === "connected" && consent !== "explicit") fail("connection_consent_required", "Email consent must be explicit before it can be used.");
    const work = this.request(requestId);
    if (!work.draft) fail("draft_required", "Accept the shape before connecting email for it.");
    return this.applyDraftEditInternal(requestId, {
      actorId: input.actorId,
      source: "manual",
      path: "connections.0",
      after: { id: "email", provider: "email", status, consent, lastCheckedAt: input.lastCheckedAt ?? null },
      now: input.now,
    }, true);
  }

  addRehearsalScenario(requestId: string, input: AddRehearsalScenarioInput): RehearsalScenario {
    return addRehearsalScenarioOperation(this, requestId, input);
  }

  runRehearsal(requestId: string, input: RunRehearsalInput = {}): RehearsalRun {
    return runRehearsalOperation(this, requestId, input);
  }

  runSavedRehearsals(requestId: string, now?: string): RehearsalRun[] {
    return runSavedRehearsalsOperation(this, requestId, now);
  }

  getPublishReadiness(requestId: string, version?: number): PublishReadiness {
    return getPublishReadinessOperation(this, requestId, version);
  }

  approvePublish(requestId: string, input: ApprovePublishInput): InquiryWork {
    return approvePublishOperation(this, requestId, input);
  }

  publish(requestId: string, input: PublishInput): Promise<PublishResult> {
    return publishOperation(this, requestId, input);
  }

  recordPublishVerification(requestId: string, input: RecordPublishVerificationInput): InquiryWork {
    return recordPublishVerificationOperation(this, requestId, input);
  }

  prepareUndo(requestId: string): UndoPlan {
    return prepareUndoOperation(this, requestId);
  }

  undo(requestId: string, input: PublishInput): Promise<PublishResult> {
    return undoOperation(this, requestId, input);
  }

  receiveInquiry(input: ReceiveInquiryInput): InquiryRecord {
    return receiveInquiryOperation(this, input);
  }

  recordInquiryEvent(inquiryId: string, input: RecordInquiryEventInput): InquiryTimelineEvent {
    return recordInquiryEventOperation(this, inquiryId, input);
  }

  explainWhy(inquiryId: string): WhyResult {
    return explainWhyOperation(this, inquiryId);
  }

  createResponsibility(input: ResponsibilityCreateInput): ResponsibilityPolicy {
    return createResponsibilityOperation(this, input);
  }

  updateResponsibility(responsibilityId: string, input: ResponsibilityUpdateInput): ResponsibilityPolicy {
    return updateResponsibilityOperation(this, responsibilityId, input);
  }

  evaluateResponsibilityAction(responsibilityId: string, action: ResponsibilityAction, input: { at?: string; messageBody?: string } = {}): ResponsibilityEvaluation {
    return evaluateResponsibilityActionOperation(this, responsibilityId, action, input);
  }

  recordResponsibilityAction(input: ResponsibilityActionInput): ResponsibilityActionReceipt {
    return recordResponsibilityActionOperation(this, input);
  }

  promoteResponsibility(responsibilityId: string, actorId: string, now?: string): ResponsibilityPolicy {
    return promoteResponsibilityOperation(this, responsibilityId, actorId, now);
  }

  pauseResponsibility(responsibilityId: string, actorId: string, now?: string): ResponsibilityPolicy {
    return pauseResponsibilityOperation(this, responsibilityId, actorId, now);
  }

  resumeResponsibility(responsibilityId: string, actorId: string, now?: string): ResponsibilityPolicy {
    return resumeResponsibilityOperation(this, responsibilityId, actorId, now);
  }

  copyPattern(sourceCapabilityId: string, input: PatternCopyInput): InquiryWork {
    return copyPatternOperation(this, sourceCapabilityId, input);
  }

  bulkUpdateInquiries(input: BulkInquiryUpdate): ChangeReceipt {
    return bulkUpdateInquiriesOperation(this, input);
  }

  undoBulkChange(changeId: string, input: { actorId: string; now?: string }): ChangeReceipt {
    return undoBulkChangeOperation(this, changeId, input);
  }

  // The operation modules use this narrow host seam instead of reaching into
  // the engine's persistence or provider adapters.
  _state(): InquiryEngineState {
    return this.state;
  }

  _now(value?: string): string {
    return timestamp(value, this.nowFn);
  }

  _id(prefix: string): string {
    return this.ids(prefix);
  }

  _emit(): void {
    this.emit();
  }

  _request(requestId: string): InquiryWork {
    return this.request(requestId);
  }

  _capability(capabilityId: string): InquiryCapabilityState {
    return this.capability(capabilityId);
  }

  _change(changeId: string): ChangeReceipt {
    return this.change(changeId);
  }

  _inquiry(inquiryId: string): InquiryRecord {
    return this.inquiry(inquiryId);
  }

  _responsibility(responsibilityId: string): ResponsibilityPolicy {
    return this.responsibility(responsibilityId);
  }

  _addActionReceipt(input: Omit<ActionReceipt, "id">): ActionReceipt {
    return this.addActionReceipt(input);
  }

  _latestRunsPass(work: InquiryWork): boolean {
    return this.latestRunsPass(work);
  }

  _publisher(): InquiryEngineOptions["livePublisher"] {
    return this.livePublisher;
  }

  private syncRuleSentences(definition: InquiryCapabilityDefinition): void {
    if (definition.routing) {
      const label = typeof definition.record.singularLabel === "string" ? definition.record.singularLabel.trim() : "";
      const noun = label || "inquiry request";
      definition.routing.sentence = `Send each new ${noun.toLowerCase()} to ${definition.routing.destination} within ${definition.routing.withinMinutes} minutes.`;
    }
    if (definition.followUp) {
      definition.followUp.sentence = `If nobody replies within ${formatDuration(definition.followUp.afterMinutes)}, Strelva follows up once.`;
    }
  }

  private autoRerunSavedRehearsals(work: InquiryWork, now: string): void {
    if (work.rehearsalScenarioIds.length === 0) {
      // Historical runs are retained for evidence, but none of them prove the
      // new version. Publish readiness checks their definitionVersion.
      return;
    }
    work.state = "rehearsing";
    for (const scenarioId of work.rehearsalScenarioIds) this.runRehearsal(work.id, { scenarioId, now, emit: false });
    if (this.latestRunsPass(work)) work.state = "ready_to_publish";
  }

  private addActionReceipt(input: Omit<ActionReceipt, "id">): ActionReceipt {
    const receipt: ActionReceipt = { id: this.ids("receipt"), ...input };
    this.state.actionReceipts.unshift(receipt);
    return receipt;
  }

  private request(requestId: string): InquiryWork {
    const cleanId = text(requestId, "request", 200);
    const work = this.state.requests.find((item) => item.id === cleanId);
    if (!work) fail("missing_request", "That inquiry work is unavailable in this business.");
    return work;
  }

  private capability(capabilityId: string): InquiryCapabilityState {
    const cleanId = text(capabilityId, "capability", 200);
    const capability = this.state.capabilities.find((item) => item.id === cleanId);
    if (!capability) fail("missing_capability", "That inquiry capability is unavailable in this business.");
    return capability;
  }

  private change(changeId: string): ChangeReceipt {
    const change = this.state.changes.find((item) => item.id === changeId);
    if (!change) fail("missing_change", "That change receipt is unavailable in this business.");
    return change;
  }

  private inquiry(inquiryId: string): InquiryRecord {
    const cleanId = text(inquiryId, "inquiry", 200);
    const inquiry = this.state.inquiries.find((item) => item.id === cleanId);
    if (!inquiry) fail("missing_inquiry", "That inquiry is unavailable in this business.");
    return inquiry;
  }

  private responsibility(responsibilityId: string): ResponsibilityPolicy {
    const cleanId = text(responsibilityId, "responsibility", 200);
    const policy = this.state.responsibilities.find((item) => item.id === cleanId);
    if (!policy) fail("missing_responsibility", "That responsibility is unavailable in this business.");
    return policy;
  }

  private latestRunsPass(work: InquiryWork): boolean {
    if (work.rehearsalScenarioIds.length === 0) return false;
    return work.rehearsalScenarioIds.every((scenarioId) => {
      const latest = this.state.rehearsalRuns
        .filter((run) => run.requestId === work.id && run.scenarioId === scenarioId)
        .sort((left, right) => Date.parse(right.ranAt) - Date.parse(left.ranAt))[0];
      return Boolean(latest && latest.definitionVersion === work.draft?.version && latest.passed);
    });
  }
}
