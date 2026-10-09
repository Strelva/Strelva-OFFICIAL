import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

/** No URLs, locator call logs, assertions, DOM, stdout/stderr or attachments.
 * Do not append a stock reporter: even caught locator errors can retain data. */
export default class ProviderRedactedReporter implements Reporter {
  onTestEnd(_test: TestCase, result: TestResult) {
    process.stdout.write(`Provider harness: ${result.status === "passed" ? "passed" : "failed/held"} (details withheld).\n`);
  }
  onError() { process.stdout.write("Provider harness: configuration/worker failure (details withheld).\n"); }
}
