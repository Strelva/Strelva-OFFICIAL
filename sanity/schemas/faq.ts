import { defineType, defineField } from "sanity";

export const faq = defineType({
  name: "faq",
  title: "FAQ",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string" }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
    defineField({
      name: "faqs",
      title: "FAQs",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "question", title: "Question", type: "string", validation: (r) => r.required() }),
            defineField({ name: "answer", title: "Answer", type: "text", rows: 4, validation: (r) => r.required() }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
