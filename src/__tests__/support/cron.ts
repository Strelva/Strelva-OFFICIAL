import { vi } from "vitest";

const TEST_CRON_SECRET = "test-cron-secret";

export function authenticatedCronRequest(path = "/api/cron/test"): Request {
  vi.stubEnv("CRON_SECRET", TEST_CRON_SECRET);
  return new Request(`https://app.strelva.com${path}`, {
    headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
  });
}
