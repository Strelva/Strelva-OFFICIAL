import { defineType, defineField } from "sanity";

export const providers = defineType({
  name: "providers",
  title: "Providers",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string" }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
    defineField({
      name: "providers",
      title: "Providers",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
            defineField({ name: "category", title: "Category", type: "string", options: { list: ["massage", "chiropractic", "yoga", "fitness", "specialty"] } }),
            defineField({ name: "service", title: "Service", type: "string" }),
            defineField({ name: "why_i_recommend", title: "Why I Recommend", type: "text", rows: 2 }),
            defineField({ name: "booking_link", title: "Booking Link", type: "url" }),
            defineField({ name: "phone", title: "Phone", type: "string" }),
            defineField({ name: "photo", title: "Photo", type: "image", options: { hotspot: true } }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
