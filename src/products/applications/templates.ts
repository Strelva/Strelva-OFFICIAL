import type { ApplicationSpec } from "./contracts";

export type ApplicationTemplateSpec = Pick<ApplicationSpec, "title" | "fields" | "components">;
export interface ApplicationTemplate {
  id: string;
  version: 1;
  name: string;
  description: string;
  category: "Team" | "Customers" | "Operations";
  spec: ApplicationTemplateSpec;
}

function template(id: string, name: string, description: string, category: ApplicationTemplate["category"], fields: ApplicationSpec["fields"]): ApplicationTemplate {
  return { id, version: 1, name, description, category, spec: { title: name, fields, components: ["form", "list", "detail"].map(kind => ({ kind: kind as "form" | "list" | "detail", fields: fields.map(field => field.id) })) } };
}

/** Versioned, data-only starters. Creation and publication still use native authorization and validation. */
export const APPLICATION_TEMPLATES: readonly ApplicationTemplate[] = [
  template("staff-requests", "Staff requests", "Give your team one place to submit requests and track their status.", "Team", [
    { id: "name", label: "Name", type: "text", required: true },
    { id: "request", label: "Request", type: "text", required: true },
    { id: "urgency", label: "Urgency", type: "select", options: ["Normal", "High", "Urgent"], required: true },
    { id: "status", label: "Status", type: "select", options: ["New", "In progress", "Done"], required: true },
  ]),
  template("client-requests", "Client requests", "Keep incoming requests and their next steps in a shared working list.", "Customers", [
    { id: "client", label: "Client", type: "text", required: true },
    { id: "request", label: "Request", type: "text", required: true },
    { id: "owner", label: "Person responsible", type: "text", required: false },
    { id: "next_step", label: "Next step", type: "text", required: false },
    { id: "status", label: "Status", type: "select", options: ["New", "In progress", "Waiting", "Closed"], required: true },
  ]),
  template("expense-log", "Expense log", "Record expenses, amounts, dates, and review status. No payments are made.", "Operations", [
    { id: "description", label: "Expense", type: "text", required: true },
    { id: "amount", label: "Amount", type: "number", required: true },
    { id: "currency", label: "Currency", type: "text", required: true },
    { id: "date", label: "Date", type: "date", required: true },
    { id: "status", label: "Review status", type: "select", options: ["To review", "Reviewed", "Needs correction"], required: true },
  ]),
  template("equipment-checkout", "Equipment checkout", "Record who has an item, when it is due, and whether it has been returned.", "Operations", [
    { id: "item", label: "Equipment", type: "text", required: true },
    { id: "borrower", label: "Borrower", type: "text", required: true },
    { id: "due", label: "Return date", type: "date", required: true },
    { id: "returned", label: "Returned", type: "boolean", required: true },
  ]),
  template("project-intake", "Project intake", "Collect project requests, the expected result, and the target date.", "Team", [
    { id: "project", label: "Project", type: "text", required: true },
    { id: "requester", label: "Requested by", type: "text", required: true },
    { id: "result", label: "Expected result", type: "text", required: true },
    { id: "target", label: "Target date", type: "date", required: false },
    { id: "status", label: "Status", type: "select", options: ["Proposed", "Accepted", "In progress", "Complete"], required: true },
  ]),
  template("feedback", "Feedback", "Collect feedback with enough context to decide what to do next.", "Customers", [
    { id: "name", label: "Name", type: "text", required: false },
    { id: "topic", label: "Topic", type: "text", required: true },
    { id: "feedback", label: "Feedback", type: "text", required: true },
    { id: "status", label: "Status", type: "select", options: ["New", "Reviewed", "Acted on"], required: true },
  ]),
  template("candidate-tracker", "Candidate tracker", "Keep candidate details and hiring stages together. Messages stay outside this tool.", "Team", [
    { id: "name", label: "Candidate", type: "text", required: true },
    { id: "role", label: "Role", type: "text", required: true },
    { id: "stage", label: "Stage", type: "select", options: ["Applied", "Screening", "Interview", "Offer", "Closed"], required: true },
    { id: "notes", label: "Notes", type: "text", required: false },
  ]),
  template("inventory-log", "Inventory log", "Keep item counts, locations, and the date they were checked in one list.", "Operations", [
    { id: "item", label: "Item", type: "text", required: true },
    { id: "quantity", label: "Quantity", type: "number", required: true },
    { id: "location", label: "Location", type: "text", required: false },
    { id: "checked", label: "Last checked", type: "date", required: true },
  ]),
];

/** Return a fresh editable copy, never the shared catalog object. */
export function applicationTemplateSpec(id: string | undefined): ApplicationTemplateSpec | null {
  const entry = APPLICATION_TEMPLATES.find(item => item.id === id);
  return entry ? structuredClone(entry.spec) : null;
}
