import { defineType, defineField } from "sanity";

export const shop = defineType({
  name: "shop",
  title: "Shop",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "sectionLabel", title: "Section Label", type: "string" }),
    defineField({ name: "headline", title: "Headline", type: "string" }),
    defineField({ name: "description", title: "Description", type: "text", rows: 2 }),
    defineField({
      name: "items",
      title: "Items",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "name", title: "Name", type: "string", validation: (r) => r.required() }),
            defineField({ name: "description", title: "Description", type: "text", rows: 3 }),
            defineField({ name: "category", title: "Category", type: "string", options: { list: ["recommended", "merch", "tools"] } }),
            defineField({ name: "price", title: "Price", type: "string" }),
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
