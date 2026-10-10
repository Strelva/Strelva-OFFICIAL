import { test } from "@playwright/test";
import { fixture, runProof } from "./support/private-authority-fixtures";

// Closed fresh-stack runner only. Fail setup rather than skip an acceptance case.
test.beforeAll(() => {
  if (process.env.STRELVA_PRIVATE_AUTHORITY_PROOF !== "1" || process.env.STRELVA_LOCAL_AUTH_PROOF !== "1") throw new Error("Dedicated fresh owned private-authority runner required.");
});
test.setTimeout(300_000);
// Default mode, one worker: preserve order without serial-mode cascade skips.
test("actual source producer commits before populated inverse refusal", async ({ browser }, info) => {
  const f = await fixture(browser);
  try {
    const input = f.publishInput(1);
    const path = await f.publicationReceipt(input);
    await info.attach("source-native-inverse-race", { body: Buffer.from(runProof(path, "source")), contentType: "application/json" });
    // Actual HTTP replay finishes qualification for the actual committed producer.
    await f.publish(input);
  } finally { await f.close(); }
});
test("actual owner grant producer commits before populated inverse refusal", async ({ browser }, info) => {
  const f = await fixture(browser);
  try {
    const first = await f.publish(f.publishInput(1));
    const path = await f.grantReceipt(f.grantInput(first.source.revisionId));
    await info.attach("grant-native-inverse-race", { body: Buffer.from(runProof(path, "grant")), contentType: "application/json" });
  } finally { await f.close(); }
});
for (const [mode, title] of [
  ["expiry", "actual expired install grant removes installed Version maker authority"],
  ["staff", "actual staff withdrawal removes installed Version maker authority"],
  ["revision", "qualified B draft retains exact A installation scope"],
  ["membership", "actual direct customer admin removal serializes installed Version writes"],
  ["membership-dual-role", "actual dual role customer admin removal refuses expired provider fallback"],
] as const) {
  test(title, async ({ browser }, info) => {
    const f = await fixture(browser);
    try {
      const path = await f.installedReceipt(mode);
      await info.attach(`installed-version-${mode}`, { body: Buffer.from(runProof(path, mode)), contentType: "application/json" });
    } finally { await f.close(); }
  });
}
