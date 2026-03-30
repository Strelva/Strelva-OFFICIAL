import { defineType, defineField } from "sanity";

export const events = defineType({
  name: "events",
  title: "Events",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string" }),
    defineField({
      name: "events",
      title: "Events",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "title", title: "Title", type: "string", validation: (r) => r.required() }),
            defineField({ name: "date", title: "Date", type: "date" }),
            defineField({ name: "time", title: "Time", type: "string" }),
            defineField({ name: "location", title: "Location", type: "string" }),
            defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
            defineField({ name: "hosted_by", title: "Hosted By", type: "string", options: { list: ["owner", "partner", "community"] } }),
            defineField({ name: "external_link", title: "External Link", type: "url" }),
            defineField({ name: "image", title: "Image", type: "image", options: { hotspot: true } }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
