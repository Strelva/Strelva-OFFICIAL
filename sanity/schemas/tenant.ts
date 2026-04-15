import { defineType, defineField } from "sanity";

export const tenant = defineType({
  name: "tenant",
  title: "Tenant",
  type: "document",
  fields: [
    defineField({ name: "id", title: "ID", type: "string", validation: (r) => r.required() }),
    defineField({ name: "subdomain", title: "Subdomain", type: "string", validation: (r) => r.required() }),
    defineField({ name: "siteName", title: "Site Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "ownerName", title: "Owner Name", type: "string", validation: (r) => r.required() }),
    defineField({ name: "ownerEmail", title: "Owner Email", type: "string" }),
    defineField({ name: "industry", title: "Industry", type: "string" }),
    defineField({ name: "active", title: "Active", type: "boolean", initialValue: true }),
    defineField({ name: "createdAt", title: "Created At", type: "string" }),
    defineField({ name: "template", title: "Template", type: "string" }),
    defineField({ name: "features", title: "Features", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "customDomains", title: "Custom Domains", type: "array", of: [{ type: "string" }] }),
    defineField({ name: "stripeCustomerId", title: "Stripe Customer ID", type: "string" }),
    defineField({ name: "subscriptionStatus", title: "Subscription Status", type: "string" }),
    defineField({ name: "bookingProvider", title: "Booking Provider", type: "string" }),
    defineField({ name: "bookingUrl", title: "Booking URL", type: "url" }),
    defineField({ name: "resendDomain", title: "Resend Domain", type: "string" }),
    defineField({ name: "siteUrl", title: "Site URL", type: "url" }),
  ],
  preview: {
    select: { title: "siteName", subtitle: "subdomain" },
  },
});
