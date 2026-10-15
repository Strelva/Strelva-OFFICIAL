import { describe, expect, it } from "vitest";
import { sentryIngestOrigin, sentrySecurityReportUri } from "@/lib/sentry-csp";

describe("sentry CSP helpers", () => {
  it("derives the ingest origin and report URI from us and eu DSNs", () => {
    expect(sentryIngestOrigin("https://abc@o1.ingest.us.sentry.io/42")).toBe("https://o1.ingest.us.sentry.io");
    expect(sentryIngestOrigin("https://abc@o9.ingest.de.sentry.io/7")).toBe("https://o9.ingest.de.sentry.io");
    expect(sentrySecurityReportUri("https://abc@o1.ingest.us.sentry.io/42")).toBe(
      "https://o1.ingest.us.sentry.io/api/42/security/?sentry_key=abc"
    );
    expect(sentrySecurityReportUri("https://abc@o1.ingest.us.sentry.io/42", "preview env")).toBe(
      "https://o1.ingest.us.sentry.io/api/42/security/?sentry_key=abc&sentry_environment=preview%20env"
    );
  });

  it("returns null for unusable input without throwing", () => {
    for (const dsn of [undefined, "", "http://abc@o1.ingest.sentry.io/42", "https://o1.ingest.sentry.io/42", "not a url"]) {
      expect(sentryIngestOrigin(dsn)).toBeNull();
      expect(sentrySecurityReportUri(dsn)).toBeNull();
    }
    expect(sentrySecurityReportUri("https://abc@o1.ingest.sentry.io/x")).toBeNull();
    expect(sentrySecurityReportUri("garbage")).toBeNull();
    expect(sentrySecurityReportUri(undefined)).toBeNull();
  });
});
