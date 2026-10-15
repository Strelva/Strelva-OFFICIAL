import { z } from "zod";
import { validEmail, validPhone, officeHoursNow } from "./office";

/** A vertical intake is an internal word: a fixed form, bound to the office's facts, that becomes an Inquiry. Owners see the App's name ("Dental intake"). */
export const VERTICAL_INTAKE_APP_IDS = ["dental_intake"] as const;
export type VerticalIntakeAppId = (typeof VERTICAL_INTAKE_APP_IDS)[number];
export const verticalIntakeAppIdSchema = z.enum(VERTICAL_INTAKE_APP_IDS);

export type IntakeFieldKind = "text" | "email" | "phone" | "choice" | "multi_choice" | "textarea";
export interface IntakeOption { value: string; label: string } // value ^[a-z][a-z0-9_]{0,39}$

export interface IntakeField {
  id: string; // ^[a-z][a-z0-9_]{0,63}$
  kind: IntakeFieldKind;
  label: string;
  hint?: string;
  required: boolean;
  maxLength?: number; // default 200; textarea default 500; hard cap 500
  options?: IntakeOption[];
  optionsFromFact?: { fact: "insurance_accepted"; extra: IntakeOption[] };
  /** Collected only when STRELVA_INTAKE_SENSITIVE_FIELDS is on and the install turns it on. Stored as ciphertext. */
  sensitive?: true;
  shownWhen?: { field: string; notIn: string[] };
  contact?: "name" | "email" | "phone";
  autocomplete?: string;
  /** How this answer reads in the one-line summary. Without it, the option labels are used. */
  summary?: { prefix?: string; labels?: Record<string, string> };
}

export interface IntakeTriageRule {
  id: string;
  when: { field: string; anyOf: string[] };
  level: "urgent";
  title: string;
  body: string;
  emergencyNote: string;
  afterSubmit: string;
}

export interface VerticalIntakeDefinition {
  appId: VerticalIntakeAppId;
  vertical: "dental";
  version: number;
  name: string;
  formTitle: string;
  intro: string;
  notice: string;
  submitLabel: string;
  thanks: { routine: string; urgent: string };
  fields: IntakeField[];
  triage: IntakeTriageRule[];
  summaryFieldIds: string[];
  booking: { proposeVisit: boolean; serviceHint: string };
}

/** Clinical and identity words an intake may never ask for. Strelva is not a HIPAA-covered system. */
export const FORBIDDEN_FIELD_PATTERN = /ssn|social.?security|birth|\bdob\b|diagnos|medication|allerg|medical.?history|health.?history|prescription|x.?ray/i;
export const SENSITIVE_RETENTION_DAYS = 30;

export const intakeInstallConfigSchema = z.object({
  bookingServiceId: z.string().min(1).max(200).nullable().default(null),
  collectMemberId: z.boolean().default(false),
  pageUrl: z.string().url().max(500).nullable().default(null),
  formLabel: z.string().trim().min(1).max(40).default("Send"),
}).strict();
export type IntakeInstallConfig = z.infer<typeof intakeInstallConfigSchema>;

export interface PublicIntakeField {
  id: string;
  kind: IntakeFieldKind;
  label: string;
  hint?: string;
  required: boolean;
  maxLength: number;
  options?: IntakeOption[];
  sensitive: boolean;
  shownWhen?: { field: string; notIn: string[] };
  autocomplete?: string;
}

export interface PublicIntakeForm {
  schemaVersion: 1;
  appId: VerticalIntakeAppId;
  release: number;
  title: string;
  intro: string;
  notice: string;
  submitLabel: string;
  fields: PublicIntakeField[];
  triage: Array<{ field: string; anyOf: string[]; title: string; body: string; emergencyNote: string; afterSubmit: string }>;
  office: { name: string | null; phone: string | null; openNow: boolean | null; todayHours: string | null };
  thanks: { routine: string; urgent: string };
  /** Which answers make the one-line summary, and how they read. */
  summaryFields: Array<{ id: string; prefix?: string; labels?: Record<string, string> }>;
  /** Which fields carry the contact, so a form can validate them as the door does. */
  contacts: Array<{ id: string; contact: "name" | "email" | "phone" }>;
}

export type IntakeValidation =
  | { ok: true; contact: { name: string; phone: string | null; email: string | null }; answers: Record<string, string>; sensitive: Array<{ fieldId: string; value: string }>; triage: "routine" | "urgent"; summary: string }
  | { ok: false; message: string };

// ---- What the Inquiries panel shows (plain data, safe in the browser) ----

export interface IntakeReadinessRow { id: "phone" | "site" | "insurance" | "hours" | "booking" | "email"; state: "done" | "missing" | "note"; blocking: boolean; label: string; detail: string }
export interface IntakeLiveCheck { state: "found" | "not_seen" | "unreachable"; checkedAt: string; url: string; release: number | null }
export interface IntakeInstallView {
  id: string; workspaceId: string; appId: VerticalIntakeAppId; status: "draft" | "live" | "paused"; draftConfig: IntakeInstallConfig; draftRevision: number;
  liveRelease: number | null; liveRequestedAt: string | null; lastLiveCheck: IntakeLiveCheck | null; updatedAt: string;
}
export interface IntakeReleaseView { number: number; definitionVersion: number; config: IntakeInstallConfig; madeLiveAt: string; madeLiveBy: string }
export interface IntakeSubmissionView {
  id: string; leadRowId: string; name: string; email: string | null; phone: string | null; answers: Record<string, string>;
  triage: "routine" | "urgent" | null; state: "new" | "visit_booked" | "not_booked"; bookingId: string | null; createdAt: string; hasSensitive: boolean;
  reasonLabel: string | null;
}
export interface IntakeAppView {
  app: { appId: VerticalIntakeAppId; name: string; label: string };
  /** The viewer's role on this business: owner, admin, member or agency. */
  access: string;
  install: IntakeInstallView | null;
  releases: IntakeReleaseView[];
  readiness: IntakeReadinessRow[];
  canGoLive: boolean;
  sites: Array<{ siteId: string; host: string; siteKey: string; lines: { script: string; mount: string }; codeSnippet: string }>;
  services: Array<{ id: string; name: string }>;
  submissions: IntakeSubmissionView[];
  sensitiveAvailable: boolean;
  emailOn: boolean;
  manualBookingsOn: boolean;
  previewForm: PublicIntakeForm;
}

const ID = /^[a-z][a-z0-9_]{0,63}$/;
const OPTION_VALUE = /^[a-z][a-z0-9_]{0,39}$/;

function staticValues(field: IntakeField): Set<string> {
  return new Set([...(field.options ?? []), ...(field.optionsFromFact?.extra ?? [])].map(option => option.value));
}

export function assertIntakeDefinition(def: VerticalIntakeDefinition): void {
  const fail = (reason: string): never => { throw new Error(`${def.name}: ${reason}`); };
  const byId = new Map<string, IntakeField>();
  for (const field of def.fields) {
    if (!ID.test(field.id)) fail(`field id ${field.id} is not allowed`);
    if (byId.has(field.id)) fail(`duplicate field id ${field.id}`);
    byId.set(field.id, field);
    if (FORBIDDEN_FIELD_PATTERN.test(field.id) || FORBIDDEN_FIELD_PATTERN.test(field.label)) fail(`field ${field.id} asks for clinical or identity details`);
    if ((field.maxLength ?? 0) > 500) fail(`field ${field.id} maxLength is above 500`);
    const seen = new Set<string>();
    for (const option of [...(field.options ?? []), ...(field.optionsFromFact?.extra ?? [])]) {
      if (!OPTION_VALUE.test(option.value)) fail(`option value ${option.value} is not allowed`);
      if (seen.has(option.value)) fail(`duplicate option ${option.value} in ${field.id}`);
      seen.add(option.value);
    }
    if ((field.kind === "choice" || field.kind === "multi_choice") && !field.options?.length && !field.optionsFromFact) fail(`choice field ${field.id} has no options`);
    if (field.sensitive && (field.required || field.kind !== "text")) fail(`sensitive field ${field.id} must be optional text`);
  }
  const names = def.fields.filter(field => field.contact === "name");
  const reachable = def.fields.filter(field => (field.contact === "phone" || field.contact === "email") && field.required);
  if (names.length !== 1 || !names[0]!.required) fail("needs exactly one required name field");
  if (!reachable.length) fail("needs a required phone or email field");
  for (const field of def.fields) {
    if (!field.shownWhen) continue;
    const other = byId.get(field.shownWhen.field);
    if (!other) fail(`${field.id} is shown by unknown field ${field.shownWhen.field}`);
    const values = staticValues(other!);
    for (const value of field.shownWhen.notIn) if (!values.has(value)) fail(`${field.id} refers to unknown option ${value}`);
  }
  for (const rule of def.triage) {
    const other = byId.get(rule.when.field);
    if (!other) fail(`triage rule ${rule.id} refers to unknown field ${rule.when.field}`);
    const values = staticValues(other!);
    for (const value of rule.when.anyOf) if (!values.has(value)) fail(`triage rule ${rule.id} refers to unknown option ${value}`);
  }
  for (const id of def.summaryFieldIds) if (!byId.has(id)) fail(`summary field ${id} is unknown`);
}

export function factOptionValue(label: string): string {
  return "p_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 37);
}

function maxLengthOf(field: IntakeField): number {
  return Math.min(500, field.maxLength ?? (field.kind === "textarea" ? 500 : 200));
}

export function publicIntakeForm(
  def: VerticalIntakeDefinition,
  release: number,
  config: IntakeInstallConfig,
  facts: Record<string, unknown>,
  options: { sensitiveAvailable: boolean; now: Date },
): PublicIntakeForm {
  const carriersRaw = (facts.insurance_accepted as { carriers?: unknown } | undefined)?.carriers;
  const carriers = Array.isArray(carriersRaw) ? carriersRaw.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];
  const keepSensitive = options.sensitiveAvailable && config.collectMemberId;
  const fields: PublicIntakeField[] = [];
  for (const field of def.fields) {
    if (field.sensitive && !keepSensitive) continue;
    let choices = field.options;
    if (field.optionsFromFact) {
      const merged: IntakeOption[] = [];
      const seen = new Set<string>();
      for (const carrier of carriers) {
        const value = factOptionValue(carrier);
        if (seen.has(value)) continue;
        seen.add(value);
        merged.push({ value, label: carrier });
      }
      for (const extra of field.optionsFromFact.extra) if (!seen.has(extra.value)) { seen.add(extra.value); merged.push(extra); }
      choices = merged;
    }
    fields.push({
      id: field.id, kind: field.kind, label: field.label,
      ...(field.hint ? { hint: field.hint } : {}),
      required: field.required, maxLength: maxLengthOf(field),
      ...(choices ? { options: choices.map(option => ({ value: option.value, label: option.label })) } : {}),
      sensitive: Boolean(field.sensitive),
      ...(field.shownWhen ? { shownWhen: { field: field.shownWhen.field, notIn: [...field.shownWhen.notIn] } } : {}),
      ...(field.autocomplete ? { autocomplete: field.autocomplete } : {}),
    });
  }
  const phone = typeof facts.phone === "string" && facts.phone.trim() ? facts.phone : null;
  const name = typeof facts.display_name === "string" && facts.display_name.trim() ? facts.display_name : null;
  const hours = officeHoursNow(facts.hours, options.now);
  const byId = new Map(def.fields.map(field => [field.id, field]));
  return {
    schemaVersion: 1,
    appId: def.appId,
    release,
    title: def.formTitle,
    intro: def.intro,
    notice: def.notice,
    submitLabel: config.formLabel !== "Send" ? config.formLabel : def.submitLabel,
    fields,
    triage: def.triage.map(rule => ({ field: rule.when.field, anyOf: [...rule.when.anyOf], title: rule.title, body: rule.body, emergencyNote: rule.emergencyNote, afterSubmit: rule.afterSubmit })),
    office: { name, phone, openNow: hours.openNow, todayHours: hours.todayHours },
    thanks: { ...def.thanks },
    summaryFields: def.summaryFieldIds.map(id => ({ id, ...(byId.get(id)?.summary ?? {}) })),
    contacts: def.fields.filter(field => field.contact).map(field => ({ id: field.id, contact: field.contact! })),
  };
}

function clean(value: string, multiline: boolean): string {
  return value.replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "").trim();
}

export function validateIntakeAnswers(form: PublicIntakeForm, raw: unknown): IntakeValidation {
  const generic: IntakeValidation = { ok: false, message: "Something went wrong. Please check the form and try again." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return generic;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 20 || entries.some(([, value]) => typeof value !== "string")) return generic;
  const input = new Map(entries as Array<[string, string]>);
  const answers: Record<string, string> = {};
  const sensitive: Array<{ fieldId: string; value: string }> = [];
  const contact: { name: string; phone: string | null; email: string | null } = { name: "", phone: null, email: null };
  const contactOf = new Map(form.contacts.map(item => [item.id, item.contact]));
  const given = (id: string) => clean(input.get(id) ?? "", false);
  for (const field of form.fields) {
    if (field.shownWhen && field.shownWhen.notIn.includes(given(field.shownWhen.field))) continue;
    const value = clean(input.get(field.id) ?? "", field.kind === "textarea").slice(0, 10_000);
    if (!value) {
      if (field.required) return { ok: false, message: `Please answer: ${field.label}.` };
      continue;
    }
    if (value.length > field.maxLength) return { ok: false, message: `Please shorten: ${field.label}.` };
    let stored = value;
    if (field.kind === "email" && !validEmail(value)) return { ok: false, message: "Enter a valid email address, or clear it and use your phone number." };
    if (field.kind === "phone" && !validPhone(value)) return { ok: false, message: "Enter a valid phone number." };
    if (field.kind === "choice" && !field.options?.some(option => option.value === value)) return { ok: false, message: `Please answer: ${field.label}.` };
    if (field.kind === "multi_choice") {
      const picked = [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
      if (!picked.length || picked.some(item => !field.options?.some(option => option.value === item))) return { ok: false, message: `Please answer: ${field.label}.` };
      stored = picked.join(",");
    }
    const asContact = contactOf.get(field.id);
    if (asContact) contact[asContact] = stored;
    else if (field.sensitive) sensitive.push({ fieldId: field.id, value: stored });
    else answers[field.id] = stored;
  }
  const urgent = form.triage.some(rule => {
    const answered = (answers[rule.field] ?? "").split(",").filter(Boolean);
    return answered.some(item => rule.anyOf.includes(item));
  });
  return { ok: true, contact, answers, sensitive, triage: urgent ? "urgent" : "routine", summary: summarizeIntakeAnswers(form, answers) };
}

/** The one-line summary of what was answered, the way the form's definition says it reads. */
export function summarizeIntakeAnswers(form: PublicIntakeForm, answers: Record<string, string>): string {
  const parts: string[] = [];
  for (const spec of form.summaryFields) {
    const field = form.fields.find(item => item.id === spec.id);
    const value = answers[spec.id];
    if (!field || !value) continue;
    const text = value.split(",").map(item => spec.labels?.[item] ?? field.options?.find(option => option.value === item)?.label ?? item).join(", ");
    parts.push(`${spec.prefix ?? ""}${text}`);
  }
  return parts.join(" · ").slice(0, 1000);
}

export function intakeReviewLines(form: PublicIntakeForm, config: IntakeInstallConfig, bookingServiceName: string | null, emailOn: boolean): string[] {
  const lines: string[] = [];
  lines.push(`Questions: ${form.fields.map(field => field.label).join(", ")}`);
  const carrier = form.fields.find(field => field.id === "insurance_carrier");
  if (carrier) {
    const plans = (carrier.options ?? []).filter(option => option.value.startsWith("p_")).map(option => option.label);
    lines.push(`Insurance plans shown: ${plans.length ? plans.join(", ") : "None listed yet: patients choose No insurance or Other"}`);
  }
  if (form.triage.length) lines.push(`Tooth pain or swelling: patients are told to call ${form.office.phone ?? "the office"} now`);
  const asksMemberId = form.fields.some(field => field.sensitive) && config.collectMemberId;
  lines.push(asksMemberId ? `Member ID: asked, stored encrypted, deleted after ${SENSITIVE_RETENTION_DAYS} days` : "Member ID: not asked");
  lines.push(bookingServiceName ? `Visits are proposed for: ${bookingServiceName}` : "Visits: the office books them by phone");
  if (!emailOn) lines.push("Patients aren't emailed. The office calls them back.");
  return lines;
}
