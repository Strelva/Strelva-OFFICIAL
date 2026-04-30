import { defineType, defineField } from "sanity";

export const onboardLead = defineType({
  name: "onboardLead",
  title: "Onboard Lead",
  type: "document",
  fields: [
    defineField({ name: "businessName", title: "Business Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "description", title: "Description", type: "text" }),
    defineField({ name: "location", title: "Location", type: "string" }),
    defineField({ name: "email", title: "Email", type: "string", validation: (r) => r.required() }),
    defineField({ name: "currentWebsite", title: "Current Website", type: "url" }),
    defineField({ name: "referredBy", title: "Referred By", type: "string" }),
    defineField({ name: "status", title: "Status", type: "string", options: { list: ["new", "contacted", "qualified", "converted", "lost"] }, initialValue: "new" }),
  ],
  preview: {
    select: { title: "businessName", subtitle: "email" },
  },
});
