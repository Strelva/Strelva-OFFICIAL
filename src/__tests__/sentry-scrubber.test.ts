import { describe, expect, it } from "vitest";
import { readSentrySecretValues, scrubSentryBreadcrumb, scrubSentryEvent } from "@/lib/sentry-scrubber";

describe("Sentry data scrubbing", () => {
  it("removes request credentials, query values, known secrets, and token-shaped strings", () => {
    const cronSecret = "cron-secret-fixture-9d2e";
    const instagramToken = "IGQVJX_fixture_access_token_0123456789ABCDEFGHIJ";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.signature_fixture_123456789";
    const event = {
      message: `cron failed with ${cronSecret}; refresh token ${jwt}; provider ${instagramToken}; authorization Bearer provider-secret-fixture-001`,
      transaction: "GET /api/cron/poll-instagram",
      request: {
        url: "https://app.strelva.test/api/approve?token=approve-link-fixture&mode=owner",
        method: "POST",
        headers: {
          accept: "application/json",
          cookie: "sb-project-auth-token=owner-session-fixture",
          Cookie: "sb-project-auth-token=owner-session-fixture",
          authorization: "Bearer cron-secret-fixture-9d2e",
          "x-api-key": "provider-secret-fixture-001",
          "x-provider-key": "another-provider-secret-fixture-002",
        },
        cookies: { "sb-project-auth-token": "owner-session-fixture" },
        query_string: "token=approve-link-fixture&mode=owner",
        data: {
          providerToken: instagramToken,
          message: `request used ${cronSecret} and ${jwt}`,
        },
      },
      breadcrumbs: [{
        message: `GET /api/workspace-export/v3/download?build=build-fixture&token=export-link-fixture failed with ${cronSecret}`,
        data: {
          url: "https://graph.instagram.test/me/media?access_token=instagram-query-fixture",
          "http.query": "?access_token=instagram-query-fixture",
          "http.fragment": "#owner-session-fixture",
          response: `provider returned ${instagramToken}`,
        },
      }],
      spans: [{ data: {
        "http.url": "https://app.strelva.test/api/owner-website-preview?token=owner-decision-fixture",
        "http.target": "/api/workspace-export/v3/download?build=build-fixture&token=export-link-fixture",
        "url.full": "https://app.strelva.test/b/manage-booking-fixture-token",
        "url.query": "?token=owner-decision-fixture",
        "http.query": "?access_token=instagram-query-fixture",
      } }],
      contexts: { trace: { data: { "http.url": "https://app.strelva.test/try/signed-preview-fixture-token" } } },
      extra: { providerResponse: `token=${instagramToken}; cron=${cronSecret}; jwt=${jwt}` },
    };

    scrubSentryEvent(event, [cronSecret]);

    expect(event.request.url).toBe("https://app.strelva.test/api/approve");
    expect(event.request.headers).toEqual({ accept: "application/json" });
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.query_string).toBeUndefined();
    expect(event.transaction).toBe("GET /api/cron/poll-instagram");
    const breadcrumb = event.breadcrumbs[0]!;
    const span = event.spans[0]!;
    expect(breadcrumb.message).toContain("/api/workspace-export/[private]");
    expect(breadcrumb.data.url).toBe("https://graph.instagram.test/me/media");
    expect(breadcrumb.data["http.query"]).toBeUndefined();
    expect(breadcrumb.data["http.fragment"]).toBeUndefined();
    expect(span.data["http.url"]).toBe("https://app.strelva.test/api/owner-website-preview");
    expect(span.data["http.target"]).toBe("/api/workspace-export/[private]");
    expect(span.data["url.full"]).toBe("https://app.strelva.test/b/[token]");
    expect(span.data["url.query"]).toBeUndefined();
    expect(span.data["http.query"]).toBeUndefined();

    const serialized = JSON.stringify(event);
    for (const secret of [cronSecret, instagramToken, jwt, "provider-secret-fixture-001", "another-provider-secret-fixture-002", "owner-session-fixture", "approve-link-fixture", "export-link-fixture", "instagram-query-fixture", "owner-decision-fixture", "manage-booking-fixture-token", "signed-preview-fixture-token"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("GET /api/cron/poll-instagram");
  });

  it("redacts signed-token path segments and query strings while keeping the route", () => {
    const paths = [
      ["https://app.strelva.test/b/manage-link-fixture-token", "https://app.strelva.test/b/[token]"],
      ["/book-inquiry/booking-offer-fixture-token/action?slot=slot-fixture", "/book-inquiry/[token]/action"],
      ["/inquiry-booking/inquiry-offer-fixture-token", "/inquiry-booking/[token]"],
      ["/try/signed-possibility-fixture-token", "/try/[token]"],
      ["/delivery/signed-delivery-fixture-token", "/delivery/[token]"],
      ["/workspace/invitations/accept/invitation-fixture-token", "/workspace/[private]"],
      ["/api/workspace-invitations/accept/invitation-fixture-token", "/api/workspace-invitations/[private]"],
      ["/api/websites/shared/share-fixture-token", "/api/websites/shared/[token]"],
    ];

    for (const [input, expected] of paths) {
      const event = { request: { url: input } };
      scrubSentryEvent(event);
      expect(event.request.url).toBe(expected);
    }
  });

  it("scrubs standalone breadcrumbs and values from known secret environment variables", () => {
    const secrets = readSentrySecretValues({
      CRON_SECRET: "cron-env-secret-fixture-123",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-fixture-123",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key-fixture-123",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.test/1",
      REDIS_URL: "redis://user:redis-secret-fixture-123@redis.test",
    });
    const breadcrumb = {
      message: "request failed",
      data: {
        url: "https://app.strelva.test/api/approve?token=owner-decision-fixture",
        "http.query": "?access_token=instagram-query-fixture",
        detail: "cron-env-secret-fixture-123",
        context: { authHeader: "Bearer service-role-secret-fixture-123" },
      },
    };

    scrubSentryBreadcrumb(breadcrumb, secrets);

    expect(breadcrumb.data.url).toBe("https://app.strelva.test/api/approve");
    expect(breadcrumb.data["http.query"]).toBeUndefined();
    expect(breadcrumb.data.detail).not.toContain("cron-env-secret-fixture-123");
    expect(breadcrumb.data.context.authHeader).not.toContain("service-role-secret-fixture-123");
    expect(secrets).not.toContain("public-anon-key-fixture-123");
    expect(secrets).not.toContain("https://public@example.test/1");
    expect(secrets).toContain("redis://user:redis-secret-fixture-123@redis.test");
  });
});


describe("private Sentry diagnostics", () => {
  it.each(["/workspace", "/business/private-company", "/api/inquiry-workspace/records/private-record", "/api/workspace-claims/private-token", "/api/agency-proposals"])("retains diagnostics without private content for %s", (url) => {
    const event = {
      event_id: "fictional-event-id",
      level: "error",
      message: "Alice Example asked about estate planning",
      request: { url: `https://private-company.test${url}?email=alice@example.test#signed-token`, method: "POST", headers: { referer: "/private-company" }, data: { inquiry: "Alice's message" } },
      transaction: `POST ${url}`,
      user: { id: "private-owner", email: "alice@example.test" },
      tags: { business: "Private Company", userId: "private-owner" },
      extra: { draft: "Alice's proposal", nestedSecret: "redact-me" },
      futurePayload: { privateRecord: "Alice's record" },
      exception: { privateData: "Alice", values: [{ type: "TypeError", value: "Alice's message", stacktrace: { frames: [{ filename: "app:///src/platform/possibilities/execute.ts", function: "executePossibility", lineno: 42, colno: 4, vars: { client: "Alice" }, pre_context: ["Alice"] }] } }] },
      contexts: { business: { name: "Private Company" }, trace: { trace_id: "fixture-trace-id", span_id: "fixture-span-id", op: "http.server", data: { body: "Alice's proposal" } } },
      breadcrumbs: [{ category: "console", level: "error", message: "Alice's draft", data: { arguments: ["Alice's draft"] } }],
      spans: [{ op: "db.query", span_id: "fixture-span-id", description: "SELECT Alice", data: { params: ["Alice"] } }],
    };
    expect(scrubSentryEvent(event)).toBe(event);
    expect(event.event_id).toBe("fictional-event-id");
    expect(event.exception.values[0]?.type).toBe("TypeError");
    expect(event.exception.values[0]?.stacktrace.frames[0]).toEqual({ filename: "app:///src/platform/possibilities/execute.ts", function: "executePossibility", lineno: 42, colno: 4 });
    expect(event.contexts.trace.op).toBe("http.server");
    expect(event.request.method).toBe("POST");
    expect(event.request.url).toContain("/[private]");
    const serialized = JSON.stringify(event);
    for (const privateValue of ["Alice", "estate planning", "alice@example.test", "private-company", "Private Company", "private-owner", "private-record", "private-token", "redact-me", "signed-token", "SELECT"]) expect(serialized).not.toContain(privateValue);
  });

  it("applies strict browser privacy even when the event has no request URL", () => {
    const event = { message: "Alice's draft", extra: { proposal: "Alice" }, exception: { values: [{ type: "Error", value: "Alice" }] } };
    scrubSentryEvent(event, [], true);
    expect(event).toEqual({ exception: { values: [{ type: "Error" }] } });
    const breadcrumb = { category: "ui.click", message: "button Alice", data: { target: "Alice" } };
    scrubSentryBreadcrumb(breadcrumb, [], true);
    expect(breadcrumb).toEqual({ category: "ui.click" });
  });

  it("scrubs common PII and secrets on public events without suppressing the error", () => {
    const event = { message: "Request failed for alice@example.test at +1 (716) 555-0100", user: { email: "alice@example.test" }, extra: { phone_number: "7165550100", businessName: "Private Company", api_key: "fictional-api-key" } };
    expect(scrubSentryEvent(event)).toBe(event);
    expect(event.message).toBe("Request failed for [Redacted] at [Redacted]");
    expect(event.user).toBeUndefined();
    expect(Object.values(event.extra)).toEqual(["[Redacted]", "[Redacted]", "[Redacted]"]);
  });
});
