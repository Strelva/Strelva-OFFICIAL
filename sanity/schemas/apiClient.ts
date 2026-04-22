import { defineType, defineField } from "sanity";

export const apiClient = defineType({
  name: "apiClient",
  title: "API Client",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "apiKey", title: "API Key", type: "string", validation: (r) => r.required() }),
    defineField({
      name: "plan",
      title: "Plan",
      type: "string",
      options: { list: ["starter", "growth", "scale"] },
      initialValue: "growth",
    }),
    defineField({ name: "active", title: "Active", type: "boolean", initialValue: true }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime" }),
    defineField({ name: "ownerEmail", title: "Owner Email", type: "string" }),
    defineField({ name: "ownerName", title: "Owner Name", type: "string" }),
    defineField({ name: "siteUrl", title: "Site URL", type: "url" }),
    defineField({ name: "stripeCustomerId", title: "Stripe Customer ID", type: "string" }),
    defineField({ name: "usageThisMonth", title: "Usage This Month", type: "number", initialValue: 0 }),
    defineField({ name: "lastActiveAt", title: "Last Active At", type: "datetime" }),
  ],
  preview: {
    select: { title: "name", subtitle: "plan", active: "active" },
    prepare({ title, subtitle, active }) {
      return {
        title,
        subtitle: `${subtitle}${active ? "" : " (inactive)"}`,
      };
    },
  },
});
