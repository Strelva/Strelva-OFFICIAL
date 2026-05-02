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
    defineField({ name: "productionDomain", title: "Production Domain", type: "string", description: "Primary production domain (e.g., yourbusiness.com)" }),
    defineField({ name: "adminDomain", title: "Admin Domain", type: "string", description: "Admin dashboard domain (e.g., admin.yourbusiness.com). Derived from productionDomain if not set." }),
    defineField({ name: "stripeCustomerId", title: "Stripe Customer ID", type: "string" }),
    defineField({ name: "subscriptionStatus", title: "Subscription Status", type: "string" }),
    defineField({ name: "bookingProvider", title: "Booking Provider", type: "string" }),
    defineField({ name: "bookingUrl", title: "Booking URL", type: "url" }),
    defineField({ name: "resendDomain", title: "Resend Domain", type: "string" }),
    defineField({ name: "siteUrl", title: "Site URL", type: "url" }),
    defineField({ name: "ownerPhone", title: "Owner Phone", type: "string" }),
    defineField({ name: "referredBy", title: "Referred By", type: "string" }),
    defineField({ name: "autoPublish", title: "Auto Publish", type: "boolean", initialValue: true }),
    defineField({ name: "beholdFeedId", title: "Behold.so Feed ID", type: "string" }),
    defineField({ name: "businessRules", title: "Business Rules", type: "text" }),
    defineField({ name: "personality", title: "AI Personality", type: "string" }),
    defineField({
      name: "socialConfig",
      title: "Social Config",
      type: "object",
      fields: [
        defineField({ name: "connectedPlatforms", title: "Connected Platforms", type: "array", of: [{ type: "string" }] }),
      ],
    }),
    defineField({
      name: "reviewsConfig",
      title: "Reviews Config",
      type: "object",
      fields: [
        defineField({ name: "googlePlaceId", title: "Google Place ID", type: "string" }),
        defineField({ name: "yelpBusinessId", title: "Yelp Business ID", type: "string" }),
      ],
    }),
    defineField({
      name: "businessHours",
      title: "Business Hours",
      type: "object",
      fields: [
        defineField({ name: "timezone", title: "Timezone", type: "string" }),
        defineField({
          name: "regular",
          title: "Regular Hours",
          type: "array",
          of: [{
            type: "object",
            fields: [
              defineField({ name: "day", title: "Day", type: "number" }),
              defineField({ name: "open", title: "Open", type: "string" }),
              defineField({ name: "close", title: "Close", type: "string" }),
              defineField({ name: "closed", title: "Closed", type: "boolean" }),
            ],
          }],
        }),
        defineField({
          name: "holidays",
          title: "Holidays",
          type: "array",
          of: [{
            type: "object",
            fields: [
              defineField({ name: "date", title: "Date", type: "string" }),
              defineField({ name: "label", title: "Label", type: "string" }),
            ],
          }],
        }),
      ],
    }),
    // Client integrations (per-tenant, not platform-level)
    defineField({ name: "slackWebhookUrl", title: "Slack Webhook URL", type: "url" }),
    defineField({
      name: "twilioConfig",
      title: "Twilio Config",
      type: "object",
      fields: [
        defineField({ name: "accountSid", title: "Account SID", type: "string" }),
        defineField({ name: "authToken", title: "Auth Token", type: "string" }),
        defineField({ name: "phoneNumber", title: "Phone Number", type: "string" }),
      ],
    }),
    defineField({ name: "googleSearchConsoleKey", title: "Google Search Console Key", type: "text" }),
    defineField({ name: "instagramAccessToken", title: "Instagram Access Token", type: "string" }),
    defineField({ name: "revalidateUrl", title: "Revalidate URL", type: "url", description: "URL to POST to when content changes (e.g., https://clientsite.com/api/revalidate)" }),
    defineField({ name: "revalidationSecret", title: "Revalidation Secret", type: "string", description: "Shared secret for HMAC-signed revalidation requests" }),
    // Branding (for OG images, favicons, etc.)
    defineField({
      name: "branding",
      title: "Branding",
      type: "object",
      fields: [
        defineField({ name: "initials", title: "Initials", type: "string", description: "1-2 letter monogram (e.g., GL)" }),
        defineField({ name: "tagline", title: "Tagline", type: "string", description: "Short tagline for OG images" }),
        defineField({ name: "bgColor", title: "Background Color", type: "string", description: "Hex color (e.g., #2c2418)" }),
        defineField({ name: "accentColor", title: "Accent Color", type: "string", description: "Hex color (e.g., #5a260c)" }),
        defineField({ name: "fgColor", title: "Foreground Color", type: "string", description: "Hex color (e.g., #faf8f5)" }),
      ],
    }),
  ],
  preview: {
    select: { title: "siteName", subtitle: "subdomain" },
  },
});
