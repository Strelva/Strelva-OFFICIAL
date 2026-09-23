export {};
/**
 * Read a tenant's spam pit (caught form spam, 30-day window).
 *
 *   pnpm tsx scripts/spam-pit.ts cocard-anderson [limit]
 *
 * Needs SPAM_PIT_READ_KEY in the env (macOS: Keychain "Strelva spam pit read key").
 * STRELVA_APP_URL overrides the host (default https://app.strelva.com).
 */
const tenant = process.argv[2];
const limit = process.argv[3] ?? "100";
const key = process.env.SPAM_PIT_READ_KEY;
const base = process.env.STRELVA_APP_URL ?? "https://app.strelva.com";
if (!tenant || !key) {
  console.error("usage: SPAM_PIT_READ_KEY=... pnpm tsx scripts/spam-pit.ts <tenant> [limit]");
  process.exit(1);
}
const res = await fetch(`${base}/api/v1/spam-pit/${tenant}?limit=${limit}`, {
  headers: { Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { count, items } = (await res.json()) as {
  count: number;
  items: Array<{ createdAt: string; reason: string; name?: string; email?: string; message?: string }>;
};
console.log(`${tenant}: ${count} caught`);
for (const s of items) {
  console.log(`${s.createdAt}  [${s.reason}]  ${s.name ?? "-"} <${s.email ?? "-"}>  ${(s.message ?? "").slice(0, 80)}`);
}
