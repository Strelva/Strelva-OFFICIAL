import { defineType, defineField } from "sanity";

export const activityLog = defineType({
  name: "activityLog",
  title: "Activity Log",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "text", title: "Text", type: "string" }),
    defineField({ name: "activityType", title: "Type", type: "string" }),
    defineField({ name: "time", title: "Time", type: "datetime" }),
    defineField({ name: "section", title: "Section", type: "string" }),
    defineField({ name: "actor", title: "Actor", type: "string" }),
    defineField({ name: "snapshot", title: "Snapshot", type: "text", description: "JSON-serialized previous content (for version history restore)" }),
  ],
  preview: {
    select: { title: "text", subtitle: "time" },
  },
});
