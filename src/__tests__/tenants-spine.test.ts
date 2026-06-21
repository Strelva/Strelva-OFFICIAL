import { describe, expect, it } from "vitest";
import { rowToTenant, tenantToRow } from "@/lib/tenants";
import type { Row } from "@/lib/db/client";

// A realistic tenants row, modeled on the live gldf prod row (the routing-
// critical fields are what matter — a mapping slip here 500s the control plane).
const gldfRow = {
  id: "gldf",
  site_name: "Great Lakes Dried Fruit",
  owner_name: "Great Lakes Dried Fruit",
  owner_email: "greatlakesdriedfruit@gmail.com",
  owner_phone: null,
  industry: "food-brand",
  active: true,
  created_at: "2026-03-30",
  template: null,
  delivery_model: "custom_repo",
  production_domain: "greatlakesdriedfruit.com",
  admin_domain: "admin.greatlakesdriedfruit.com",
  referred_by: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: "none",
  subscription_started_at: null,
  subscription_past_due_since: null,
  commitment_ends_at: null,
  plan_override: null,
  auto_publish: true,
  auto_approve_threshold: null,
  business_rules: null,
  personality: null,
  business_hours: null,
  features: null,
  integrations: null,
  custom_domains: null,
  booking_provider: null,
  booking_url: null,
  resend_domain: null,
  site_url: null,
  revalidate_url: "https://greatlakesdriedfruit.com/api/revalidate",
  revalidation_secret: "secret-abc",
  custom_repo: { repoUrl: "https://github.com/x/gldf" },
  visibility: null,
  site_capabilities: null,
  branding: null,
  social_config: null,
  reviews_config: { googlePlaceId: "place123" },
  updated_at: "2026-06-20",
  behold_feed_id: null,
  slack_webhook_url: null,
  google_search_console_key: null,
  instagram_access_token: null,
} as unknown as Row<"tenants">;

describe("tenants spine mapper (rowToTenant)", () => {
  const t = rowToTenant(gldfRow);

  it("maps the routing-critical fields a wrong value would 500 on", () => {
    expect(t.id).toBe("gldf");
    expect(t.subdomain).toBe("gldf"); // no column; subdomain == id
    expect(t.active).toBe(true);
    expect(t.deliveryModel).toBe("custom_repo");
    expect(t.productionDomain).toBe("greatlakesdriedfruit.com");
    expect(t.adminDomain).toBe("admin.greatlakesdriedfruit.com");
    expect(t.revalidateUrl).toBe("https://greatlakesdriedfruit.com/api/revalidate");
    expect(t.revalidationSecret).toBe("secret-abc");
  });

  it("maps display + ownership + status", () => {
    expect(t.siteName).toBe("Great Lakes Dried Fruit");
    expect(t.ownerEmail).toBe("greatlakesdriedfruit@gmail.com");
    expect(t.subscriptionStatus).toBe("none");
    expect(t.autoPublish).toBe(true);
  });

  it("handles nulls + defaults safely", () => {
    expect(t.template).toBe("wellness"); // null template -> default, never undefined
    expect(t.autoApproveThreshold).toBeNull();
    expect(t.domainClaims).toEqual([]); // domain_claims table empty
    expect(t.ownerPhone).toBeUndefined();
    expect(t.stripeCustomerId).toBeUndefined();
  });

  it("maps jsonb columns to typed objects", () => {
    expect(t.customRepo).toEqual({ repoUrl: "https://github.com/x/gldf" });
    expect(t.reviewsConfig).toEqual({ googlePlaceId: "place123" });
  });
});

describe("tenants spine round-trip (tenantToRow . rowToTenant)", () => {
  it("preserves the routing-critical columns through a round-trip", () => {
    const row = tenantToRow(rowToTenant(gldfRow));
    expect(row.id).toBe("gldf");
    expect(row.site_name).toBe("Great Lakes Dried Fruit");
    expect(row.production_domain).toBe("greatlakesdriedfruit.com");
    expect(row.admin_domain).toBe("admin.greatlakesdriedfruit.com");
    expect(row.revalidation_secret).toBe("secret-abc");
    expect(row.delivery_model).toBe("custom_repo");
    expect(row.active).toBe(true);
  });

  it("a partial update only sets the changed columns (no clobber)", () => {
    const row = tenantToRow({ id: "gldf", siteName: "New Name" });
    expect(row.site_name).toBe("New Name");
    expect(row).not.toHaveProperty("production_domain");
    expect(row).not.toHaveProperty("revalidation_secret");
  });
});
