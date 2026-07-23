import { describe, expect, it } from "vitest";
import { buildTenantLaunchReadiness, tenantHasOwnerMessage } from "@/lib/launch-readiness";
import type { TenantConfig } from "@/lib/types";
import type { Thread } from "@/lib/threads";

const baseTenant: TenantConfig = {
  id: "client",
  subdomain: "client",
  siteName: "Client Site",
  ownerName: "Owner",
  ownerEmail: "owner@example.com",
  industry: "wellness",
  active: true,
  createdAt: "2026-05-01",
  template: "wellness",
  deliveryModel: "custom_repo",
  subscriptionStatus: "active",
  productionDomain: "client.com",
  adminDomain: "admin.client.com",
  revalidateUrl: "https://client.com/api/revalidate",
  revalidationSecret: "secret",
};

describe("tenant launch readiness", () => {
  it("marks a tenant ready when custom repo, access, AI usage, and weekly proof are present", () => {
    const result = buildTenantLaunchReadiness({
      tenant: baseTenant,
      infrastructure: [
        { name: "client domain", status: "ok", message: "client.com" },
        { name: "admin domain", status: "ok", message: "admin.client.com" },
        { name: "revalidation", status: "ok", message: "configured" },
      ],
      activity: [
        { text: "AI updated hero", time: "2026-05-10T12:00:00.000Z", type: "ai", actor: "ai" },
      ],
      threadCount: 1,
      hasOwnerMessage: true,
      draftCount: 0,
      hasWeeklyBrief: true,
    });

    expect(result.status).toBe("ready");
    expect(result.score).toBe(100);
    expect(result.items.map((item) => item.id)).toContain("custom-repo");
    expect(result.items.map((item) => item.id)).toContain("owner-ai-message");
    expect(result.items.map((item) => item.id)).toContain("weekly-proof");
  });

  it("blocks launch when the owner path or billing path is missing", () => {
    const result = buildTenantLaunchReadiness({
      tenant: {
        ...baseTenant,
        ownerEmail: undefined,
        subscriptionStatus: "none",
      },
      infrastructure: [],
      activity: [],
      threadCount: 0,
      hasOwnerMessage: false,
      draftCount: 0,
      hasWeeklyBrief: false,
    });

    // Blocks on the REAL hard go-live gate (owner access). Billing-not-set is a
    // "watch" (in-progress), not a blocker — a mid-onboarding client without
    // billing yet shouldn't paint red on the overview. Owner-hasn't-used-AI is a
    // managed-client adoption signal ("watch"), never a launch blocker.
    expect(result.status).toBe("blocked");
    expect(result.items.find((item) => item.id === "owner-access")?.status).toBe("blocked");
    expect(result.items.find((item) => item.id === "billing")?.status).toBe("watch");
    expect(result.items.find((item) => item.id === "owner-ai-message")?.status).toBe("watch");
  });

  it("does NOT block launch just because the owner hasn't used the dashboard", () => {
    const result = buildTenantLaunchReadiness({
      tenant: { ...baseTenant, billingType: "case_study" },
      infrastructure: [
        { name: "client domain", status: "ok", message: "client.com" },
        { name: "admin domain", status: "ok", message: "admin.client.com" },
        { name: "revalidation", status: "ok", message: "configured" },
      ],
      activity: [],
      threadCount: 0,
      hasOwnerMessage: false,
      draftCount: 0,
      hasWeeklyBrief: false,
    });

    // A live, billed managed site with no owner engagement is "watch", not "blocked".
    expect(result.status).toBe("watch");
    expect(result.items.find((item) => item.id === "owner-ai-message")?.status).toBe("watch");
    expect(result.items.find((item) => item.id === "billing")?.status).toBe("ready");
  });

  it("treats platform-template delivery as watch, not a reason to build more templates", () => {
    const result = buildTenantLaunchReadiness({
      tenant: {
        ...baseTenant,
        deliveryModel: "platform_template",
      },
      infrastructure: [],
      activity: [],
      threadCount: 1,
      hasOwnerMessage: true,
      draftCount: 0,
      hasWeeklyBrief: true,
    });

    const customRepoItem = result.items.find((item) => item.id === "custom-repo");
    expect(customRepoItem?.status).toBe("watch");
    expect(customRepoItem?.detail).toContain("avoid adding more templates");
  });

  it("detects whether saved threads include an owner message", () => {
    const threads: Thread[] = [
      {
        id: "thread_1",
        title: "First",
        createdAt: "2026-05-10T12:00:00.000Z",
        updatedAt: "2026-05-10T12:00:00.000Z",
        messages: [{ id: "m1", role: "assistant", content: "Hello", timestamp: "2026-05-10T12:00:00.000Z" }],
      },
      {
        id: "thread_2",
        title: "Second",
        createdAt: "2026-05-10T12:00:00.000Z",
        updatedAt: "2026-05-10T12:00:00.000Z",
        messages: [{ id: "m2", role: "user", content: "Update my hours", timestamp: "2026-05-10T12:00:00.000Z" }],
      },
    ];

    expect(tenantHasOwnerMessage(threads)).toBe(true);
  });
});
