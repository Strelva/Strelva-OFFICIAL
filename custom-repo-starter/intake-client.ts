/** Portable Strelva App form contract (Dental intake). Copy with StrelvaIntake into client sites. */

// Keep in sync with src/products/vertical-intake/contracts.ts.
export type IntakeFieldKind = "text" | "email" | "phone" | "choice" | "multi_choice" | "textarea";

export interface PublicIntakeField {
  id: string;
  kind: IntakeFieldKind;
  label: string;
  hint?: string;
  required: boolean;
  maxLength: number;
  options?: Array<{ value: string; label: string }>;
  sensitive: boolean;
  shownWhen?: { field: string; notIn: string[] };
  autocomplete?: string;
}

export interface PublicIntakeForm {
  schemaVersion: 1;
  appId: string;
  release: number;
  title: string;
  intro: string;
  notice: string;
  submitLabel: string;
  fields: PublicIntakeField[];
  triage: Array<{ field: string; anyOf: string[]; title: string; body: string; emergencyNote: string; afterSubmit: string }>;
  office: { name: string | null; phone: string | null; openNow: boolean | null; todayHours: string | null };
  thanks: { routine: string; urgent: string };
}

const KINDS: readonly string[] = ["text", "email", "phone", "choice", "multi_choice", "textarea"];
const SITE_KEY = /^sk_pub_[a-z0-9]{24}$/;
const APP_ID = /^[a-z][a-z_]{2,39}$/;
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/;
const text = (value: unknown, max = 2000): value is string => typeof value === "string" && value.length <= max;
const nullableText = (value: unknown): value is string | null => value === null || text(value, 200);

export function isPublicIntakeForm(value: unknown): value is PublicIntakeForm {
  if (!value || typeof value !== "object") return false;
  const form = value as PublicIntakeForm;
  if (form.schemaVersion !== 1 || !text(form.appId, 40) || !Number.isSafeInteger(form.release) || form.release < 0) return false;
  if (!text(form.title, 200) || !text(form.intro) || !text(form.notice) || !text(form.submitLabel, 80)) return false;
  if (!Array.isArray(form.fields) || form.fields.length === 0 || form.fields.length > 20) return false;
  if (!Array.isArray(form.triage) || form.triage.length > 5) return false;
  const office = form.office;
  if (!office || typeof office !== "object" || !nullableText(office.name) || !nullableText(office.phone) || !nullableText(office.todayHours) || (office.openNow !== null && typeof office.openNow !== "boolean")) return false;
  if (!form.thanks || !text(form.thanks.routine) || !text(form.thanks.urgent)) return false;
  const ids = new Set<string>();
  const fieldsOk = form.fields.every(field => {
    if (!field || typeof field !== "object" || !FIELD_ID.test(field.id) || ids.has(field.id)) return false;
    ids.add(field.id);
    if (!KINDS.includes(field.kind) || !text(field.label, 200) || typeof field.required !== "boolean" || typeof field.sensitive !== "boolean") return false;
    if (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 500) return false;
    if (field.hint !== undefined && !text(field.hint)) return false;
    if (field.autocomplete !== undefined && !text(field.autocomplete, 40)) return false;
    if (field.shownWhen !== undefined && (!text(field.shownWhen.field, 64) || !Array.isArray(field.shownWhen.notIn) || !field.shownWhen.notIn.every(item => text(item, 40)))) return false;
    const choice = field.kind === "choice" || field.kind === "multi_choice";
    if (field.options === undefined) return !choice;
    return choice && Array.isArray(field.options) && field.options.length > 0 && field.options.length <= 100
      && field.options.every(option => option && text(option.value, 40) && text(option.label, 200));
  });
  if (!fieldsOk) return false;
  return form.triage.every(rule => rule && ids.has(rule.field) && Array.isArray(rule.anyOf) && rule.anyOf.every(item => text(item, 40))
    && text(rule.title, 200) && text(rule.body) && text(rule.emergencyNote) && text(rule.afterSubmit));
}

function endpoint(baseUrl: string, siteKey: string, appId: string): string {
  if (!SITE_KEY.test(siteKey)) throw new Error("Invalid site key.");
  if (!APP_ID.test(appId)) throw new Error("Invalid App.");
  return `${baseUrl.replace(/\/$/, "")}/api/v1/connect/${siteKey}/apps/${appId}`;
}

export async function loadIntakeForm(baseUrl: string, siteKey: string, appId: string, signal?: AbortSignal): Promise<PublicIntakeForm> {
  const response = await fetch(endpoint(baseUrl, siteKey, appId), { credentials: "omit", cache: "no-store", signal });
  if (!response.ok) throw new Error("This form isn't available right now. Please call or email the office.");
  const body: unknown = await response.json();
  if (!isPublicIntakeForm(body)) throw new Error("This form isn't available right now. Please call or email the office.");
  return body;
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return "i" + Array.from(bytes, byte => byte.toString(36).padStart(2, "0")).join("").slice(0, 22);
}

/** Posts the answers to the office through Strelva. The server decides triage; nothing is emailed from here. */
export async function submitIntake(baseUrl: string, siteKey: string, appId: string, answers: Record<string, string>, honeypot = ""): Promise<{ ok: true; triage: "routine" | "urgent" }> {
  const response = await fetch(`${endpoint(baseUrl, siteKey, appId)}/intake`, {
    method: "POST",
    credentials: "omit",
    // text/plain keeps this a simple CORS request: no preflight.
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ id: randomId(), path: typeof location === "undefined" ? undefined : location.pathname, _hp: honeypot, answers }),
  });
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error.length <= 200 ? body.error : "Check your answers and try again.";
    throw new Error(message);
  }
  if (response.status === 409) throw new Error("This form isn't available right now. Please call the office.");
  if (!response.ok) throw new Error("That didn't send. Please call the office.");
  const result: unknown = await response.json().catch(() => null);
  const triage = result && typeof result === "object" && "triage" in result && result.triage === "urgent" ? "urgent" : "routine";
  return { ok: true, triage };
}
