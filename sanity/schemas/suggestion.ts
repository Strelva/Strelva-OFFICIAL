import { defineType, defineField } from "sanity";

export const suggestion = defineType({
  name: "suggestion",
  title: "Suggestion",
  type: "document",
  fields: [
    defineField({ name: "id", title: "ID", type: "string", validation: (r) => r.required() }),
    defineField({ name: "tenantId", title: "Tenant ID", type: "string", validation: (r) => r.required() }),
    defineField({ name: "suggestionType", title: "Type", type: "string" }),
    defineField({ name: "title", title: "Title", type: "string" }),
    defineField({ name: "description", title: "Description", type: "text" }),
    defineField({ name: "action", title: "Action", type: "string" }),
    defineField({ name: "section", title: "Section", type: "string" }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime" }),
    defineField({ name: "status", title: "Status", type: "string" }),
  ],
  preview: {
    select: { title: "title", subtitle: "status" },
  },
});
