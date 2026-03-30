import { defineType, defineField } from "sanity";

export const hero = defineType({
  name: "hero",
  title: "Hero",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "headline", title: "Headline", type: "text", rows: 3, validation: (r) => r.required() }),
    defineField({ name: "subheadline", title: "Subheadline", type: "string" }),
    defineField({ name: "tagline", title: "Tagline", type: "text", rows: 2, validation: (r) => r.required() }),
    defineField({ name: "ctaText", title: "CTA Text", type: "string", validation: (r) => r.required() }),
    defineField({ name: "ctaLink", title: "CTA Link", type: "string" }),
    defineField({ name: "backgroundImage", title: "Background Image", type: "image", options: { hotspot: true } }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "headline" },
  },
});
