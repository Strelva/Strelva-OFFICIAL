/** Starting fields only. Templates carry no customer records, credentials or grants. */
export const TRACKER_TEMPLATES = [
  { id: "tasks", name: "Task list", description: "Work to do, who owns it, and when it is due.", fields: ["Task", "Owner", "Due date", "Status", "Notes"] },
  { id: "projects", name: "Project tracker", description: "Projects, customers, next steps, and progress.", fields: ["Project", "Customer", "Owner", "Next step", "Due date", "Status"] },
  { id: "inventory", name: "Inventory list", description: "Items, locations, quantities, and reorder notes.", fields: ["Item", "Location", "Quantity", "Reorder at", "Supplier", "Notes"] },
] as const;

export type TrackerTemplateId = typeof TRACKER_TEMPLATES[number]["id"];

export function trackerTemplateSource(id: TrackerTemplateId) {
  const template = TRACKER_TEMPLATES.find(item => item.id === id);
  if (!template) throw new Error("Choose an available tracker template.");
  return { fileName: `${id}-template.csv`, mimeType: "text/csv" as const, content: `${template.fields.join(",")}\n` };
}
