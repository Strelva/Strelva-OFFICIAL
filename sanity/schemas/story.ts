import { defineType, defineField } from "sanity";

export const story = defineType({
  name: "story",
  title: "Story",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "text", rows: 2, validation: (r) => r.required() }),
    defineField({ name: "accentText", title: "Accent Text", type: "string" }),
    defineField({ name: "statement", title: "Statement", type: "text", rows: 3, validation: (r) => r.required() }),
    defineField({ name: "paragraphs", title: "Paragraphs", type: "array", of: [{ type: "text" }] }),
    defineField({
      name: "stats",
      title: "Stats",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "value", title: "Value", type: "string" }),
            defineField({ name: "label", title: "Label", type: "string" }),
          ],
        },
      ],
    }),
    defineField({ name: "quote", title: "Quote", type: "string" }),
    defineField({ name: "quoteAttribution", title: "Quote Attribution", type: "string" }),
    defineField({ name: "portraitImage", title: "Portrait Image", type: "image", options: { hotspot: true } }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
