import { defineType, defineField } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "siteName", title: "Site Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "siteTagline", title: "Site Tagline", type: "string" }),
    defineField({ name: "siteDescription", title: "Site Description", type: "text", rows: 3 }),
    defineField({ name: "siteKeywords", title: "Site Keywords", type: "string" }),
    defineField({ name: "ownerName", title: "Owner Name", type: "string" }),
    defineField({ name: "ownerTitle", title: "Owner Title", type: "string" }),
    defineField({ name: "footerTagline", title: "Footer Tagline", type: "string" }),
    defineField({ name: "copyrightText", title: "Copyright Text", type: "string" }),
    defineField({ name: "bookingUrl", title: "Booking URL", type: "url" }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "siteName" },
  },
});
