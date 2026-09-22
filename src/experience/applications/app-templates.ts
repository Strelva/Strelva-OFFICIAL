import { applicationSpecSchema, type ApplicationSpec } from "@/products/applications/contracts";

export type ApplicationDraftSpec = Omit<ApplicationSpec, "maintenanceOwner">;
export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: "Team" | "Operations" | "Customers";
  fields: ApplicationSpec["fields"];
}

/** Curated native application schemas. No generated code, records, or access grants. */
export const APP_TEMPLATES: readonly AppTemplate[] = [
  { id: "staff-requests", name: "Staff requests", description: "Give your team one place to submit requests and see their status.", category: "Team", fields: [
    { id: "name", label: "Name", type: "text", required: true },
    { id: "request", label: "Request", type: "text", required: true },
    { id: "urgency", label: "Urgency", type: "select", required: true, options: ["Normal", "Urgent"] },
    { id: "status", label: "Status", type: "select", required: false, options: ["New", "In progress", "Done"] },
  ] },
  { id: "project-tasks", name: "Project tasks", description: "Keep a small project moving with owners, due dates, and clear status.", category: "Team", fields: [
    { id: "task", label: "Task", type: "text", required: true },
    { id: "owner", label: "Owner", type: "text", required: false },
    { id: "due", label: "Due date", type: "date", required: false },
    { id: "status", label: "Status", type: "select", required: true, options: ["To do", "In progress", "Done"] },
  ] },
  { id: "inventory", name: "Inventory", description: "Keep a shared list of items, quantities, and storage locations.", category: "Operations", fields: [
    { id: "item", label: "Item", type: "text", required: true },
    { id: "quantity", label: "Quantity", type: "number", required: true },
    { id: "location", label: "Location", type: "text", required: false },
    { id: "reorder", label: "Needs reordering", type: "boolean", required: false },
  ] },
  { id: "client-intake", name: "Client intake", description: "Collect contact details and a general request. Leave sensitive information out.", category: "Customers", fields: [
    { id: "name", label: "Name", type: "text", required: true },
    { id: "contact", label: "Contact email", type: "text", required: true },
    { id: "request", label: "General request", type: "text", required: true },
    { id: "status", label: "Status", type: "select", required: false, options: ["New", "Contacted", "Closed"] },
  ] },
];

export function templateDraft(template: AppTemplate): ApplicationDraftSpec {
  const fields = structuredClone(template.fields);
  return { title: template.name, fields, components: [{ kind: "form", fields: fields.map(field => field.id) }, { kind: "list", fields: fields.map(field => field.id) }] };
}

export function validateApplicationDraft(draft: ApplicationDraftSpec): string | null {
  const parsed = applicationSpecSchema.safeParse({ ...draft, maintenanceOwner: "assigned-by-server" });
  return parsed.success ? null : parsed.error.issues.map(issue => issue.message).join(" ");
}

export function removeDraftField(draft: ApplicationDraftSpec, id: string): ApplicationDraftSpec {
  if (draft.fields.length <= 1) return draft;
  const fields = draft.fields.filter(field => field.id !== id);
  return { ...draft, fields, components: draft.components.map(component => ({ ...component, fields: component.fields.filter(field => field !== id) })).filter(component => component.fields.length) };
}

export function addDraftField(draft: ApplicationDraftSpec): ApplicationDraftSpec {
  if (draft.fields.length >= 30) return draft;
  let suffix = 1;
  while (draft.fields.some(field => field.id === `field_${suffix}`)) suffix += 1;
  const field: ApplicationSpec["fields"][number] = { id: `field_${suffix}`, label: "New field", type: "text", required: false };
  return { ...draft, fields: [...draft.fields, field], components: draft.components.map(component => ({ ...component, fields: [...component.fields, field.id] })) };
}
