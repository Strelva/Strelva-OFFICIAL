import type {
  ResponsibilityAction,
  ResponsibilityActionInput,
  ResponsibilityActionReceipt,
  ResponsibilityApprovalClause,
  ResponsibilityBudget,
  ResponsibilityCreateInput,
  ResponsibilityEvaluation,
  ResponsibilityHours,
  ResponsibilityNeverClause,
  ResponsibilityPolicy,
  ResponsibilityUpdateInput,
} from "./contracts";
import { InquiryEngineHost, actor, clean, clone, time } from "./inquiry-engine-operations";

function defaultBudget(input: ResponsibilityCreateInput): ResponsibilityBudget {
  const dailyMessages = input.budget?.dailyMessages ?? 20;
  if (!Number.isInteger(dailyMessages) || dailyMessages < 1 || dailyMessages > 10_000) throw new Error("The daily message budget must be a whole number from 1 to 10,000.");
  const timezone = input.budget?.timezone?.trim() || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); } catch { throw new Error("The budget timezone is not valid."); }
  return { dailyMessages, timezone };
}

function defaultHours(input: ResponsibilityCreateInput): ResponsibilityHours {
  const hours: ResponsibilityHours = {
    timezone: input.hours?.timezone?.trim() || input.budget?.timezone?.trim() || "UTC",
    days: input.hours?.days ? [...input.hours.days] : [1, 2, 3, 4, 5],
    start: input.hours?.start?.trim() || "08:00",
    end: input.hours?.end?.trim() || "19:00",
  };
  if (hours.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Responsibility hours need days from 0 through 6.");
  if (hours.days.length === 0) throw new Error("Responsibility hours need at least one day.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hours.end)) throw new Error("Responsibility hours must use HH:mm.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: hours.timezone }).format(); } catch { throw new Error("The responsibility timezone is not valid."); }
  return hours;
}

function uniqueActions(actions: ResponsibilityAction[]): ResponsibilityAction[] {
  return [...new Set(actions)];
}

export function createResponsibility(host: InquiryEngineHost, input: ResponsibilityCreateInput): ResponsibilityPolicy {
  const capability = host._capability(input.capabilityId);
  const actorId = actor(input.actorId);
  const now = time(host, input.now);
  const allowedActions = uniqueActions(input.allowedActions);
  if (allowedActions.length === 0) throw new Error("Give the responsibility at least one allowed action.");
  const preAuthorizedActions = uniqueActions(input.preAuthorizedActions ?? []);
  if (preAuthorizedActions.some((action) => !allowedActions.includes(action))) throw new Error("Pre-authorized actions must be inside the allowed actions.");
  const never = clone(input.never ?? []) as ResponsibilityNeverClause[];
  const approval = clone(input.approval ?? []) as ResponsibilityApprovalClause[];
  if (never.some((clause) => !allowedActions.includes(clause.action))) throw new Error("A Never clause must name an allowed action.");
  const policy: ResponsibilityPolicy = {
    id: host._id("responsibility"),
    businessId: host.businessId,
    capabilityId: capability.id,
    title: clean(input.title, "responsibility title", 200),
    scope: clean(input.scope, "responsibility scope", 1000),
    allowedActions,
    preAuthorizedActions,
    never,
    approval,
    budget: defaultBudget(input),
    escalation: { primary: clean(input.escalation.primary, "primary escalation contact", 200), secondary: input.escalation.secondary?.trim() || null },
    voice: input.voice?.trim() || "Friendly, clear, and concise.",
    hours: defaultHours(input),
    // A caller cannot bootstrap trust through a create payload. Promotion is
    // a separate operation after clean, evidenced receipts.
    trust: "supervised",
    status: "active",
    sponsorId: actorId,
    cleanReceiptCount: 0,
    failedReceiptCount: 0,
    requiredCleanReceipts: Math.max(1, Math.min(100, input.requiredCleanReceipts ?? 1)),
    trustChangedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  host._state().responsibilities.unshift(policy);
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: capability.id,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "person", id: actorId },
    action: "create_responsibility",
    what: `Created the responsibility “${policy.title}”.`,
    why: "Standing work must have a readable scope, boundaries, and sponsor.",
    lookedAt: ["scope", "allowed actions", "Never", "approval", "budget", "escalation", "voice and hours"],
    outcome: "recorded",
    evidence: ["starts supervised"],
    createdAt: now,
  });
  host._emit();
  return clone(policy);
}

function timeParts(date: string, zone: string): { day: number; minutes: number; dateKey: string } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(date)).map((part) => [part.type, part.value]));
    const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || !parts.weekday || !parts.year || !parts.month || !parts.day) return null;
    return { day: weekdays[parts.weekday] ?? 0, minutes: hour * 60 + minute, dateKey: `${parts.year}-${parts.month}-${parts.day}` };
  } catch {
    return null;
  }
}

function insideHours(policy: ResponsibilityPolicy, at: string): boolean {
  const parts = timeParts(at, policy.hours.timezone);
  if (!parts || !policy.hours.days.includes(parts.day)) return false;
  const [startHour, startMinute] = policy.hours.start.split(":").map(Number);
  const [endHour, endMinute] = policy.hours.end.split(":").map(Number);
  const start = startHour! * 60 + startMinute!;
  const end = endHour! * 60 + endMinute!;
  return start <= end ? parts.minutes >= start && parts.minutes <= end : parts.minutes >= start || parts.minutes <= end;
}

const OUTBOUND_ACTIONS = new Set<ResponsibilityAction>(["reply", "ask_question", "send_message"]);
const ALWAYS_REVIEW_ACTIONS = new Set<ResponsibilityAction>(["publish", "delete", "change_permissions", "charge", "quote_price", "promise_date"]);

export function evaluateResponsibilityAction(host: InquiryEngineHost, responsibilityId: string, action: ResponsibilityAction, input: { at?: string; messageBody?: string } = {}): ResponsibilityEvaluation {
  const policy = host._responsibility(responsibilityId);
  const at = time(host, input.at);
  if (policy.status === "paused") return { decision: "block", action, reason: "This responsibility is paused.", clause: "Status: paused", disclosedAs: null };
  if (!policy.allowedActions.includes(action)) return { decision: "block", action, reason: "This action is outside the responsibility's allowed actions.", clause: "Allowed actions", disclosedAs: null };
  const never = policy.never.find((clause) => clause.action === action);
  if (never) return { decision: "block", action, reason: never.sentence, clause: `Never: ${never.sentence}`, disclosedAs: null };
  if (!insideHours(policy, at)) return { decision: "block", action, reason: `This action is outside the responsibility hours. Escalate to ${policy.escalation.primary}.`, clause: `Hours: ${policy.hours.start} to ${policy.hours.end}`, disclosedAs: null };
  const dateKey = timeParts(at, policy.budget.timezone)?.dateKey;
  const used = host._state().responsibilityReceipts.filter((receipt) => receipt.responsibilityId === policy.id && receipt.status === "accepted" && OUTBOUND_ACTIONS.has(receipt.action) && dateKey !== undefined && timeParts(receipt.createdAt, policy.budget.timezone)?.dateKey === dateKey).length;
  if (OUTBOUND_ACTIONS.has(action) && used >= policy.budget.dailyMessages) return { decision: "block", action, reason: `The daily message budget is used. Escalate to ${policy.escalation.primary}.`, clause: `Budget: ${policy.budget.dailyMessages} messages per day`, disclosedAs: null };
  if (OUTBOUND_ACTIONS.has(action)) {
    if (!input.messageBody || !/strelva/i.test(input.messageBody)) return { decision: "block", action, reason: "Every customer message must say it is from Strelva.", clause: "Disclosure: messages identify Strelva", disclosedAs: null };
  }
  const clause = policy.approval.find((item) => item.action === action);
  if (policy.trust === "supervised") return { decision: "approval_required", action, reason: "This responsibility is supervised, so every action needs approval.", clause: clause?.sentence ?? "Trust: supervised", disclosedAs: OUTBOUND_ACTIONS.has(action) ? "Strelva" : null };
  if (clause) return { decision: "approval_required", action, reason: clause.sentence, clause: `Approval: ${clause.sentence}`, disclosedAs: OUTBOUND_ACTIONS.has(action) ? "Strelva" : null };
  if (ALWAYS_REVIEW_ACTIONS.has(action)) return { decision: "approval_required", action, reason: "This consequential action needs an explicit approval rule.", clause: "Consequential action", disclosedAs: null };
  if (OUTBOUND_ACTIONS.has(action) && !policy.preAuthorizedActions.includes(action)) return { decision: "approval_required", action, reason: "Outbound messaging needs a written pre-authorization in this responsibility.", clause: "Pre-authorized actions", disclosedAs: "Strelva" };
  if (!policy.preAuthorizedActions.includes(action) && policy.trust === "trusted") return { decision: "approval_required", action, reason: "Trusted status does not extend beyond the actions explicitly pre-authorized here.", clause: "Pre-authorized actions", disclosedAs: OUTBOUND_ACTIONS.has(action) ? "Strelva" : null };
  return { decision: "allow", action, reason: "This action is inside the active responsibility policy.", clause: null, disclosedAs: OUTBOUND_ACTIONS.has(action) ? "Strelva" : null };
}

export function recordResponsibilityAction(host: InquiryEngineHost, input: ResponsibilityActionInput): ResponsibilityActionReceipt {
  const policy = host._responsibility(input.responsibilityId);
  const actorId = actor(input.actorId);
  const now = time(host, input.at);
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (input.outcome && !idempotencyKey) throw new Error("A completed responsibility action needs an idempotency key.");
  if (idempotencyKey) {
    const previous = host._state().responsibilityReceipts.find((receipt) => receipt.responsibilityId === policy.id && receipt.idempotencyKey === idempotencyKey);
    if (previous) return clone(previous);
  }
  const evaluation = evaluateResponsibilityAction(host, policy.id, input.action, { at: now, messageBody: input.messageBody });
  const approvedBy = input.approvedBy?.trim() || null;
  if (approvedBy && approvedBy !== policy.sponsorId) throw new Error("Only the responsibility sponsor can authorize this action.");
  const outcomeEvidence = (input.outcomeEvidence ?? []).map((value) => clean(value, "outcome evidence", 1000));
  if (input.outcome && outcomeEvidence.length === 0) throw new Error("A completed responsibility action needs concrete outcome evidence.");
  let status: ResponsibilityActionReceipt["status"];
  if (evaluation.decision === "block") status = "blocked";
  else if (evaluation.decision === "approval_required" && !approvedBy) status = "proposed";
  else if (!input.outcome) status = "proposed";
  else status = input.outcome;
  const receipt: ResponsibilityActionReceipt = {
    id: host._id("responsibility_receipt"),
    idempotencyKey,
    responsibilityId: policy.id,
    businessId: host.businessId,
    action: input.action,
    actorId,
    status,
    evaluation,
    what: clean(input.what, "action description", 2000),
    why: clean(input.why, "action reason", 2000),
    lookedAt: (input.lookedAt ?? []).map((value) => clean(value, "looked-at evidence", 1000)),
    outcomeEvidence,
    createdAt: now,
  };
  host._state().responsibilityReceipts.unshift(receipt);
  if (status === "accepted") policy.cleanReceiptCount += 1;
  if (status === "failed") policy.failedReceiptCount += 1;
  policy.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: policy.capabilityId,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "strelva", id: policy.id, label: "Strelva" },
    action: input.action,
    what: receipt.what,
    why: receipt.why,
    lookedAt: receipt.lookedAt,
    outcome: status,
    evidence: receipt.outcomeEvidence.length > 0 ? receipt.outcomeEvidence : [evaluation.reason],
    createdAt: now,
  });
  host._emit();
  return clone(receipt);
}

export function updateResponsibility(host: InquiryEngineHost, responsibilityId: string, input: ResponsibilityUpdateInput): ResponsibilityPolicy {
  const policy = host._responsibility(responsibilityId);
  const actorId = actor(input.actorId);
  const now = time(host, input.now);
  const allowedActions = input.allowedActions ? uniqueActions(input.allowedActions) : [...policy.allowedActions];
  if (allowedActions.length === 0) throw new Error("Give the responsibility at least one allowed action.");
  const preAuthorizedActions = input.preAuthorizedActions ? uniqueActions(input.preAuthorizedActions) : [...policy.preAuthorizedActions];
  if (preAuthorizedActions.some((action) => !allowedActions.includes(action))) throw new Error("Pre-authorized actions must be inside the allowed actions.");
  const never = input.never ? clone(input.never) : [...policy.never];
  const approval = input.approval ? clone(input.approval) : [...policy.approval];
  if (never.some((clause) => !allowedActions.includes(clause.action))) throw new Error("A Never clause must name an allowed action.");
  if (approval.some((clause) => !allowedActions.includes(clause.action))) throw new Error("An approval clause must name an allowed action.");
  const budgetInput = { budget: { ...policy.budget, ...(input.budget ?? {}) } } as ResponsibilityCreateInput;
  const hoursInput = { hours: { ...policy.hours, ...(input.hours ?? {}) }, budget: budgetInput.budget } as ResponsibilityCreateInput;
  const budget = defaultBudget(budgetInput);
  const hours = defaultHours(hoursInput);
  const required = input.requiredCleanReceipts ?? policy.requiredCleanReceipts;
  if (!Number.isInteger(required) || required < 1 || required > 100) throw new Error("The clean receipt requirement must be a whole number from 1 to 100.");
  // Resolve every edited value before touching the live policy. A malformed
  // boundary must leave the previous policy and trust state intact.
  const title = input.title === undefined ? policy.title : clean(input.title, "responsibility title", 200);
  const scope = input.scope === undefined ? policy.scope : clean(input.scope, "responsibility scope", 1000);
  const escalation = input.escalation ? { primary: clean(input.escalation.primary, "primary escalation contact", 200), secondary: input.escalation.secondary?.trim() || null } : policy.escalation;
  const voice = input.voice === undefined ? policy.voice : clean(input.voice, "responsibility voice", 1000);
  policy.title = title;
  policy.scope = scope;
  policy.allowedActions = allowedActions;
  policy.preAuthorizedActions = preAuthorizedActions;
  policy.never = never;
  policy.approval = approval;
  policy.budget = budget;
  policy.escalation = escalation;
  policy.voice = voice;
  policy.hours = hours;
  policy.requiredCleanReceipts = required;
  // Any boundary edit requires a new supervised run, even if this policy was
  // previously trusted. Existing receipts remain visible as history.
  policy.trust = "supervised";
  policy.trustChangedAt = null;
  policy.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: policy.capabilityId,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "person", id: actorId },
    action: "update_responsibility",
    what: `Updated the responsibility “${policy.title}”.`,
    why: "A boundary edit returns standing work to supervised trust until it earns a clean record again.",
    lookedAt: ["scope", "allowed actions", "Never", "approval", "budget", "escalation", "voice and hours"],
    outcome: "recorded",
    evidence: ["trust reset to supervised"],
    createdAt: now,
  });
  host._emit();
  return clone(policy);
}

export function promoteResponsibility(host: InquiryEngineHost, responsibilityId: string, actorId: string, nowInput?: string): ResponsibilityPolicy {
  const policy = host._responsibility(responsibilityId);
  const sponsor = actor(actorId);
  if (policy.trust === "trusted") return clone(policy);
  if (policy.failedReceiptCount > 0) throw new Error("Resolve failed responsibility receipts before promoting trust.");
  if (policy.cleanReceiptCount < policy.requiredCleanReceipts) throw new Error(`This responsibility needs ${policy.requiredCleanReceipts} clean receipt${policy.requiredCleanReceipts === 1 ? "" : "s"} before it can be trusted.`);
  const now = time(host, nowInput);
  policy.trust = "trusted";
  policy.trustChangedAt = now;
  policy.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: policy.capabilityId,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "person", id: sponsor },
    action: "promote_responsibility",
    what: `Promoted “${policy.title}” to trusted.`,
    why: "The sponsor approved a clean record inside its written boundary.",
    lookedAt: ["clean responsibility receipts", `${policy.cleanReceiptCount} accepted`],
    outcome: "recorded",
    evidence: ["trust remains limited to pre-authorized actions"],
    createdAt: now,
  });
  host._emit();
  return clone(policy);
}

export function pauseResponsibility(host: InquiryEngineHost, responsibilityId: string, actorId: string, nowInput?: string): ResponsibilityPolicy {
  const policy = host._responsibility(responsibilityId);
  const now = time(host, nowInput);
  policy.status = "paused";
  policy.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: policy.capabilityId,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "person", id: actor(actorId) },
    action: "pause_responsibility",
    what: `Paused “${policy.title}”.`,
    why: "A paused responsibility cannot take actions.",
    lookedAt: ["responsibility status"],
    outcome: "recorded",
    evidence: ["future actions are blocked"],
    createdAt: now,
  });
  host._emit();
  return clone(policy);
}

export function resumeResponsibility(host: InquiryEngineHost, responsibilityId: string, actorId: string, nowInput?: string): ResponsibilityPolicy {
  const policy = host._responsibility(responsibilityId);
  const now = time(host, nowInput);
  policy.status = "active";
  policy.updatedAt = now;
  host._addActionReceipt({
    businessId: host.businessId,
    requestId: null,
    capabilityId: policy.capabilityId,
    inquiryId: null,
    responsibilityId: policy.id,
    actor: { kind: "person", id: actor(actorId) },
    action: "resume_responsibility",
    what: `Resumed “${policy.title}”.`,
    why: "The sponsor explicitly enabled the standing job again.",
    lookedAt: ["responsibility status"],
    outcome: "recorded",
    evidence: ["trust level unchanged"],
    createdAt: now,
  });
  host._emit();
  return clone(policy);
}
