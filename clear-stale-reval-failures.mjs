// One-shot: clear the stale revalidation-failure log (all entries are the
// deactivated `summit` demo; gldf/rohlax have none). Run once, then delete this
// file. Reads Upstash creds from the local .env.
import { readFileSync } from "node:fs";
const dir = "/Users/noahowsh/strelva-platform/";
let url = "", tok = "";
for (const f of [".env.local", ".env"]) {
  try {
    const s = readFileSync(dir + f, "utf8");
    const u = s.match(/^UPSTASH_REDIS_REST_URL=(.+)$/m);
    const t = s.match(/^UPSTASH_REDIS_REST_TOKEN=(.+)$/m);
    if (u && !url) url = u[1].trim().replace(/^["']|["']$/g, "");
    if (t && !tok) tok = t[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
}
if (!url || !tok) { console.log("No Upstash creds found in .env"); process.exit(1); }
const res = await fetch(`${url}/del/reb:revalidation:failures`, {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}` },
});
console.log("cleared reb:revalidation:failures ->", JSON.stringify(await res.json()));
