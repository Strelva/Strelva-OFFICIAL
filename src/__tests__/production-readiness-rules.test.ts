import { describe, expect, it } from "vitest";
import {
  getTenantLaunchReadinessResults,
  validateProductionEnvValue,
} from "../lib/production-readiness-rules";

describe("production readiness rules", () => {
  it("rejects Clerk test keys for production launch", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example"))
      .toBe("Must start with pk_live_ for production launch");
    expect(validateProductionEnvValue("CLERK_SECRET_KEY", "sk_test_example"))
      .toBe("Must start with sk_live_ for production launch");
  });

  it("accepts live-shaped production credentials", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_example")).toBeNull();
    expect(validateProductionEnvValue("CLERK_SECRET_KEY", "sk_live_example")).toBeNull();
    expect(validateProductionEnvValue("CLERK_WEBHOOK_SECRET", "whsec_example")).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SECRET_KEY", "sk_live_example")).toBeNull();
    expect(validateProductionEnvValue("STRIPE_SCAFFOLD_PRICE_ID", "price_example")).toBeNull();
    expect(validateProductionEnvValue("RESEND_API_KEY", "re_example")).toBeNull();
  });

  it("rejects local or non-HTTPS production URLs", () => {
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "http://scaffoldweb.com"))
      .toBe("Must be an https:// URL for production launch");
    expect(validateProductionEnvValue("NEXT_PUBLIC_SITE_URL", "https://localhost:3000"))
      .toBe("Must not point at localhost for production launch");
    expect(validateProductionEnvValue("UPSTASH_REDIS_REST_URL", "http://redis.example.com"))
      .toBe("Must be an https:// URL for production launch");
  });

  it("fails active tenants without launch domains or revalidation", () => {
    const results = getTenantLaunchReadinessResults({ id: "demo", active: true });

    expect(results).toEqual([
      {
        name: "Tenant demo client domain",
        status: "fail",
        message: "Active tenant has no customer-facing productionDomain/customDomains entry configured",
      },
      {
        name: "Tenant demo admin domain",
        status: "fail",
        message: "Active tenant has no admin domain and none can be derived",
      },
      {
        name: "Tenant demo revalidation",
        status: "fail",
        message: "Active tenant has no revalidateUrl configured",
      },
    ]);
  });

  it("passes configured active tenant launch domains and revalidation", () => {
    const results = getTenantLaunchReadinessResults({
      id: "gldf",
      active: true,
      productionDomain: "https://greatlakesdriedfruit.com/store",
      revalidateUrl: "https://greatlakesdriedfruit.com/api/v1/revalidate",
      revalidationSecret: "secret",
    });

    expect(results).toEqual([
      {
        name: "Tenant gldf client domain",
        status: "ok",
        message: "greatlakesdriedfruit.com",
      },
      {
        name: "Tenant gldf admin domain",
        status: "ok",
        message: "admin.greatlakesdriedfruit.com",
      },
      {
        name: "Tenant gldf revalidation",
        status: "ok",
        message: "URL set, secret configured",
      },
    ]);
  });
});
