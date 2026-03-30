import { defineType, defineField } from "sanity";

export const chatSession = defineType({
  name: "chatSession",
  title: "Chat Session",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "clientId", title: "Client ID", type: "string" }),
    defineField({ name: "messages", title: "Messages", type: "array", of: [{ type: "object", fields: [
      defineField({ name: "role", title: "Role", type: "string" }),
      defineField({ name: "content", title: "Content", type: "text" }),
      defineField({ name: "timestamp", title: "Timestamp", type: "datetime" }),
    ]}]}),
  ],
  preview: {
    select: { title: "clientId", subtitle: "tenant" },
  },
});
