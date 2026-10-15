import { describe, expect, it } from "vitest";
import {
  assertIntakeDefinition, factOptionValue, intakeInstallConfigSchema, intakeReviewLines, publicIntakeForm, validateIntakeAnswers,
  type VerticalIntakeDefinition,
} from "@/products/vertical-intake/contracts";
import { DENTAL_INTAKE } from "@/products/vertical-intake/definitions/dental";
import { intakeDefinition } from "@/products/vertical-intake/definitions";

const NOW = new Date("2026-10-20T14:00:00Z");
const config = (patch: object = {}) => intakeInstallConfigSchema.parse(patch);
const clone = (): VerticalIntakeDefinition => structuredClone(DENTAL_INTAKE);
const facts = { phone: "716-555-0100", display_name: "North Dental", insurance_accepted: { carriers: ["Delta Dental PPO", "Cigna"] } };
const form = (over: { collect?: boolean; sensitive?: boolean } = {}) =>
  publicIntakeForm(DENTAL_INTAKE, 1, config({ collectMemberId: over.collect ?? false }), facts, { sensitiveAvailable: over.sensitive ?? false, now: NOW });
const good = { name: "Pat Lee", phone: "716 555 0111", patient_status: "new", reason: "checkup", insurance_carrier: "p_delta_dental_ppo" };

describe("definition guard", () => {
  it("accepts the dental definition and looks it up", () => {
    expect(() => assertIntakeDefinition(DENTAL_INTAKE)).not.toThrow();
    expect(intakeDefinition("dental_intake").name).toBe("Dental intake");
    expect(() => intakeDefinition("nope")).toThrow();
  });

  it("rejects clinical, identity and malformed definitions", () => {
    const dob = clone(); dob.fields.push({ id: "extra", kind: "text", label: "Date of birth", required: false });
    expect(() => assertIntakeDefinition(dob)).toThrow(/clinical or identity/);
    const ssn = clone(); ssn.fields.push({ id: "ssn", kind: "text", label: "Number", required: false });
    expect(() => assertIntakeDefinition(ssn)).toThrow();
    const required = clone(); required.fields.find(f => f.sensitive)!.required = true;
    expect(() => assertIntakeDefinition(required)).toThrow(/sensitive/);
    const rule = clone(); rule.triage[0]!.when.anyOf = ["missing"];
    expect(() => assertIntakeDefinition(rule)).toThrow(/unknown option/);
    const dup = clone(); dup.fields.push({ ...dup.fields[0]!, contact: undefined });
    expect(() => assertIntakeDefinition(dup)).toThrow(/duplicate/);
    const none = clone(); none.fields = none.fields.filter(f => f.contact !== "phone" && f.contact !== "email");
    none.triage = []; none.fields = none.fields.filter(f => !f.shownWhen);
    expect(() => assertIntakeDefinition(none)).toThrow(/phone or email/);
  });

  it("proves a second vertical validates and renders", () => {
    const HOME_SERVICES_FIXTURE = {
      appId: "dental_intake", vertical: "dental", version: 1, name: "Home services intake", formTitle: "Request a visit", intro: "Tell us the job.", notice: "Only what we need.", submitLabel: "Send",
      thanks: { routine: "Thanks.", urgent: "Thanks. Call now." },
      fields: [
        { id: "name", kind: "text", label: "Your name", required: true, contact: "name" },
        { id: "phone", kind: "phone", label: "Phone", required: true, contact: "phone" },
        { id: "address_area", kind: "text", label: "Neighborhood", required: false },
        { id: "job_type", kind: "choice", label: "What needs doing?", required: true, options: [{ value: "leak", label: "A leak" }, { value: "gas", label: "Smell of gas" }] },
        { id: "preferred_days", kind: "multi_choice", label: "Which days?", required: false, options: [{ value: "mon", label: "Mon" }] },
      ],
      triage: [{ id: "gas", when: { field: "job_type", anyOf: ["gas"] }, level: "urgent", title: "Smell of gas?", body: "Call now.", emergencyNote: "Leave the building and call 911.", afterSubmit: "Or send this form." }],
      summaryFieldIds: ["job_type"], booking: { proposeVisit: false, serviceHint: "Visit" },
    } as VerticalIntakeDefinition;
    expect(() => assertIntakeDefinition(HOME_SERVICES_FIXTURE)).not.toThrow();
    const rendered = publicIntakeForm(HOME_SERVICES_FIXTURE, 1, config(), {}, { sensitiveAvailable: false, now: NOW });
    expect(rendered.fields.map(f => f.id)).toEqual(["name", "phone", "address_area", "job_type", "preferred_days"]);
    expect(validateIntakeAnswers(rendered, { name: "A", phone: "716 555 0100", job_type: "gas" })).toMatchObject({ ok: true, triage: "urgent", summary: "A leak".replace("A leak", "Smell of gas") });
  });
});

describe("publicIntakeForm", () => {
  it("builds insurance options from the office's list", () => {
    expect(factOptionValue("Delta Dental PPO")).toBe("p_delta_dental_ppo");
    const carrier = form().fields.find(f => f.id === "insurance_carrier")!;
    expect(carrier.options!.map(o => o.value)).toEqual(["p_delta_dental_ppo", "p_cigna", "none", "other"]);
  });

  it("offers the member ID only when the env and the install both allow it", () => {
    const has = (f: ReturnType<typeof form>) => f.fields.some(x => x.id === "insurance_member_id");
    expect(has(form({ collect: true, sensitive: false }))).toBe(false);
    expect(has(form({ collect: false, sensitive: true }))).toBe(false);
    expect(has(form({ collect: true, sensitive: true }))).toBe(true);
  });

  it("carries the office and a custom submit label", () => {
    const f = publicIntakeForm(DENTAL_INTAKE, 2, config({ formLabel: "Ask for a visit" }), facts, { sensitiveAvailable: false, now: NOW });
    expect(f.submitLabel).toBe("Ask for a visit");
    expect(f.release).toBe(2);
    expect(f.office).toMatchObject({ name: "North Dental", phone: "716-555-0100", openNow: null });
  });
});

describe("validateIntakeAnswers", () => {
  it("names the question when a required answer is missing", () => {
    expect(validateIntakeAnswers(form(), { ...good, reason: "" })).toEqual({ ok: false, message: "Please answer: What is the visit for?." });
  });

  it("uses the door's contact messages", () => {
    expect(validateIntakeAnswers(form(), { ...good, email: "nope" })).toEqual({ ok: false, message: "Enter a valid email address, or clear it and use your phone number." });
    expect(validateIntakeAnswers(form(), { ...good, phone: "12" })).toEqual({ ok: false, message: "Enter a valid phone number." });
  });

  it("flags tooth pain as urgent and normalizes multi choice", () => {
    const result = validateIntakeAnswers(form(), { ...good, reason: "urgent", preferred_days: "tue, thu,tue" });
    expect(result).toMatchObject({ ok: true, triage: "urgent", answers: { preferred_days: "tue,thu" } });
  });

  it("rejects unknown options, non-string values and too many keys", () => {
    expect(validateIntakeAnswers(form(), { ...good, reason: "cure" }).ok).toBe(false);
    expect(validateIntakeAnswers(form(), { ...good, preferred_days: "sun" }).ok).toBe(false);
    expect(validateIntakeAnswers(form(), { ...good, note: 4 }).ok).toBe(false);
    expect(validateIntakeAnswers(form(), Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "x"]))).ok).toBe(false);
    expect(validateIntakeAnswers(form(), null).ok).toBe(false);
  });

  it("keeps the member ID out of answers, and drops it when there is no insurance", () => {
    const f = form({ collect: true, sensitive: true });
    const kept = validateIntakeAnswers(f, { ...good, insurance_member_id: "ABC123" });
    expect(kept).toMatchObject({ ok: true, sensitive: [{ fieldId: "insurance_member_id", value: "ABC123" }] });
    if (kept.ok) expect(kept.answers).not.toHaveProperty("insurance_member_id");
    const dropped = validateIntakeAnswers(f, { ...good, insurance_carrier: "none", insurance_member_id: "ABC123" });
    expect(dropped).toMatchObject({ ok: true, sensitive: [] });
  });

  it("writes the summary exactly", () => {
    const result = validateIntakeAnswers(form(), { ...good, preferred_days: "tue,thu", preferred_times: "morning", note: "Hello" });
    expect(result).toMatchObject({
      ok: true,
      contact: { name: "Pat Lee", phone: "716 555 0111", email: null },
      triage: "routine",
      summary: "New patient · Checkup and cleaning · Delta Dental PPO · Prefers Tue, Thu · Mornings",
    });
  });
});

describe("intakeReviewLines", () => {
  it("lists everything the owner is approving", () => {
    const lines = intakeReviewLines(form(), config(), "New patient exam", false);
    expect(lines).toContain("Insurance plans shown: Delta Dental PPO, Cigna");
    expect(lines).toContain("Tooth pain or swelling: patients are told to call 716-555-0100 now");
    expect(lines).toContain("Member ID: not asked");
    expect(lines).toContain("Visits are proposed for: New patient exam");
    expect(lines).toContain("Patients aren't emailed. The office calls them back.");
  });

  it("says so when nothing is listed and visits are booked by phone", () => {
    const bare = publicIntakeForm(DENTAL_INTAKE, 1, config(), {}, { sensitiveAvailable: false, now: NOW });
    const lines = intakeReviewLines(bare, config(), null, true);
    expect(lines).toContain("Insurance plans shown: None listed yet: patients choose No insurance or Other");
    expect(lines).toContain("Tooth pain or swelling: patients are told to call the office now");
    expect(lines).toContain("Visits: the office books them by phone");
    expect(lines.join("\n")).not.toContain("aren't emailed");
    const asked = intakeReviewLines(form({ collect: true, sensitive: true }), config({ collectMemberId: true }), null, true);
    expect(asked).toContain("Member ID: asked, stored encrypted, deleted after 30 days");
  });
});
