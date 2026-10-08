/** Operator script: refresh the checked-in OpenAI egress snapshot.
 *  pnpm tsx scripts/refresh-provider-egress.ts
 * Reads https://openai.com/chatgpt-connectors.json and rewrites
 * src/platform/agent-channel/provider-egress-data.ts. Anthropic's single
 * published range is maintained by hand from its documentation page. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { PROVIDER_EGRESS } from "../src/platform/agent-channel/provider-egress-data";

const SOURCE = "https://openai.com/chatgpt-connectors.json";
const file = z.object({ creationTime: z.string().min(1), prefixes: z.array(z.object({ ipv4Prefix: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/) }).passthrough()).min(1) });

async function main() {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
  const data = file.parse(await response.json());
  const ipv4 = [...new Set(data.prefixes.map(p => p.ipv4Prefix))];
  const rows: string[] = [];
  for (let i = 0; i < ipv4.length; i += 6) rows.push(`    ${ipv4.slice(i, i + 6).map(v => JSON.stringify(v)).join(", ")},`);
  const anthropic = PROVIDER_EGRESS.anthropic;
  const out = [
    "/** Published provider egress ranges, checked in so no request (and no test)",
    " * fetches them. Refresh with `pnpm tsx scripts/refresh-provider-egress.ts`.",
    " * OpenAI: https://openai.com/chatgpt-connectors.json (ChatGPT connectors, plugins,",
    " * GPT Actions). Anthropic: https://platform.claude.com/docs/en/api/ip-addresses",
    ` * (outbound, covers MCP tool calls). Refreshed ${new Date().toISOString().slice(0, 10)}. Generated file. */`,
    "export const PROVIDER_EGRESS = {",
    `  openai: { source: ${JSON.stringify(SOURCE)}, creationTime: ${JSON.stringify(data.creationTime)}, ipv4: [`,
    ...rows,
    "  ] },",
    `  anthropic: { source: ${JSON.stringify(anthropic.source)}, creationTime: ${JSON.stringify(anthropic.creationTime)}, ipv4: ${JSON.stringify(anthropic.ipv4)} },`,
    "} as const satisfies Record<string, { source: string; creationTime: string; ipv4: readonly string[] }>;",
    "",
  ].join("\n");
  writeFileSync(path.join(process.cwd(), "src/platform/agent-channel/provider-egress-data.ts"), out);
  console.log(`openai: ${ipv4.length} prefixes, created ${data.creationTime}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
