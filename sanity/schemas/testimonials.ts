import { defineType, defineField } from "sanity";

export const testimonials = defineType({
  name: "testimonials",
  title: "Testimonials",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string" }),
    defineField({
      name: "testimonials",
      title: "Testimonials",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "quote", title: "Quote", type: "text", rows: 3, validation: (r) => r.required() }),
            defineField({ name: "author", title: "Author", type: "string" }),
            defineField({ name: "location", title: "Location", type: "string" }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
