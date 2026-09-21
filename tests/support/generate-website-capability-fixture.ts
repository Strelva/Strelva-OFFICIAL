import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateWebsiteArtifact } from "../../src/products/websites/generation";

async function main(): Promise<void> {
  const baseUrlIndex = process.argv.indexOf("--base-url");
  const outputIndex = process.argv.indexOf("--output");
  const baseUrl = baseUrlIndex >= 0 ? process.argv[baseUrlIndex + 1] : undefined;
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!baseUrl || !output) throw new Error("Expected --base-url and --output");

  const artifact = await generateWebsiteArtifact({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    workId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
    brief: { businessName: "Northstar Repair", description: "Same-week repair estimates", primaryCallToAction: "Request an estimate" },
    publishedCapabilities: {
      baseUrl,
      tenant: "northstar",
      inquiry: { capabilityId: "inquiry-main", version: 3 },
      booking: { capabilityId: "booking-main", version: 4, range: { from: "2026-10-01T13:00:00+00:00", to: "2026-10-31T22:00:00+00:00" } },
    },
  });
  for (const item of artifact.files) {
    const target = join(output, item.path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, item.content, "utf8");
  }
  process.stdout.write(JSON.stringify({ contentHash: artifact.contentHash, rendererDigest: artifact.rendererDigest }));
}

void main();
