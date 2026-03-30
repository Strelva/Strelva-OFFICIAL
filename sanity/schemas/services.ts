import { defineType, defineField } from "sanity";

export const services = defineType({
  name: "services",
  title: "Services",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string", validation: (r) => r.required() }),
    defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
    defineField({
      name: "services",
      title: "Services",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
            defineField({ name: "description", title: "Description", type: "text", rows: 4 }),
            defineField({ name: "duration", title: "Duration", type: "string" }),
            defineField({ name: "price", title: "Price", type: "string" }),
            defineField({ name: "featured", title: "Featured", type: "boolean", initialValue: false }),
            defineField({ name: "who_its_for", title: "Who It's For", type: "string" }),
            defineField({ name: "booking_link", title: "Booking Link", type: "url" }),
            defineField({ name: "comingSoon", title: "Coming Soon", type: "boolean", initialValue: false }),
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
