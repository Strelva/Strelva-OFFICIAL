import type { VerticalIntakeDefinition } from "../contracts";

export const DENTAL_INTAKE: VerticalIntakeDefinition = {
  appId: "dental_intake",
  vertical: "dental",
  version: 1,
  name: "Dental intake",
  formTitle: "Request a visit",
  intro: "Tell us a little about you and when you're free. The office will call you to book.",
  notice: "This form asks only what the office needs to call you back and book a visit. Please don't include medical history, medications or other health details here. The office will ask at your visit.",
  submitLabel: "Send",
  thanks: {
    routine: "Thanks. The office will call you to book your visit.",
    urgent: "Thanks. If you're in pain now, please call the office.",
  },
  fields: [
    { id: "name", kind: "text", label: "Your name", required: true, contact: "name", autocomplete: "name" },
    { id: "phone", kind: "phone", label: "Phone", required: true, contact: "phone", autocomplete: "tel" },
    { id: "email", kind: "email", label: "Email", required: false, contact: "email", autocomplete: "email", hint: "Optional. Used only to confirm your visit." },
    { id: "patient_status", kind: "choice", label: "Have you been to this office before?", required: true, options: [
      { value: "new", label: "No, I'm a new patient" },
      { value: "returning", label: "Yes, I'm a returning patient" },
    ], summary: { labels: { new: "New patient", returning: "Returning patient" } } },
    { id: "reason", kind: "choice", label: "What is the visit for?", required: true, options: [
      { value: "checkup", label: "Checkup and cleaning" },
      { value: "exam", label: "New patient exam" },
      { value: "child", label: "A visit for my child" },
      { value: "cosmetic", label: "Cosmetic consultation (whitening, veneers)" },
      { value: "second_opinion", label: "Second opinion" },
      { value: "urgent", label: "Tooth pain, swelling or a broken tooth" },
      { value: "other", label: "Something else" },
    ] },
    { id: "insurance_carrier", kind: "choice", label: "Dental insurance", required: true, optionsFromFact: { fact: "insurance_accepted", extra: [
      { value: "none", label: "I don't have dental insurance" },
      { value: "other", label: "Other plan or not sure" },
    ] } },
    { id: "insurance_member_id", kind: "text", label: "Member ID (optional)", required: false, sensitive: true, maxLength: 40, shownWhen: { field: "insurance_carrier", notIn: ["none"] }, hint: "Found on your insurance card. The office can also take it when you arrive." },
    { id: "preferred_days", kind: "multi_choice", label: "Which days work for you?", required: false, options: [
      { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
      { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" },
    ], summary: { prefix: "Prefers " } },
    { id: "preferred_times", kind: "multi_choice", label: "What time of day?", required: false, options: [
      { value: "morning", label: "Mornings" }, { value: "afternoon", label: "Afternoons" }, { value: "evening", label: "Evenings" },
    ] },
    { id: "note", kind: "textarea", label: "Anything else the office should know?", required: false, maxLength: 500, hint: "Please don't include medical details." },
  ],
  triage: [{
    id: "urgent_pain",
    when: { field: "reason", anyOf: ["urgent"] },
    level: "urgent",
    title: "Tooth pain, swelling or a broken tooth?",
    body: "Call the office now so they can see you as soon as possible.",
    emergencyNote: "If swelling is spreading to your eye or neck, or you have trouble breathing or swallowing, call 911 or go to an emergency room.",
    afterSubmit: "Or send this form and the office will call you back.",
  }],
  summaryFieldIds: ["patient_status", "reason", "insurance_carrier", "preferred_days", "preferred_times"],
  booking: { proposeVisit: true, serviceHint: "New patient exam" },
};
