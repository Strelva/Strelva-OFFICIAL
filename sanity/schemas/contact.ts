import { defineType, defineField } from "sanity";

export const contact = defineType({
  name: "contact",
  title: "Contact",
  type: "document",
  fields: [
    defineField({ name: "tenant", title: "Tenant", type: "string", validation: (r) => r.required() }),
    defineField({ name: "email", title: "Email", type: "string", validation: (r) => r.required().email() }),
    defineField({ name: "phone", title: "Phone", type: "string" }),
    defineField({ name: "address", title: "Address", type: "string" }),
    defineField({ name: "hours", title: "Hours", type: "text", rows: 5 }),
    defineField({ name: "locationTitle", title: "Location Title", type: "string" }),
    defineField({ name: "locationDescription", title: "Location Description", type: "text", rows: 2 }),
    defineField({ name: "instagramUrl", title: "Instagram URL", type: "url" }),
    defineField({ name: "facebookUrl", title: "Facebook URL", type: "url" }),
    defineField({ name: "googleMapsUrl", title: "Google Maps Embed URL", type: "text" }),
  ],
  preview: {
    select: { title: "tenant", subtitle: "email" },
  },
});
