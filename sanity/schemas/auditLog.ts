import { defineType, defineField } from "sanity";

export const auditLog = defineType({
  name: "auditLog",
  title: "Audit Log",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "auditId", title: "Audit ID", type: "string" }),
    defineField({ name: "action", title: "Action", type: "string" }),
    defineField({ name: "targetType", title: "Target Type", type: "string" }),
    defineField({ name: "targetId", title: "Target ID", type: "string" }),
    defineField({ name: "time", title: "Time", type: "datetime" }),
    defineField({ name: "actorUserId", title: "Actor User ID", type: "string" }),
    defineField({ name: "actorEmail", title: "Actor Email", type: "string" }),
    defineField({ name: "actorType", title: "Actor Type", type: "string" }),
    defineField({ name: "actorIsSuperAdmin", title: "Actor Is Super Admin", type: "boolean" }),
    defineField({ name: "metadata", title: "Metadata", type: "text", description: "JSON-serialized audit metadata" }),
  ],
  preview: {
    select: { title: "action", subtitle: "actorEmail" },
  },
});
