/**
 * Create a new API client in Sanity
 *
 * Usage:
 *   npx tsx scripts/create-api-client.ts "Great Lakes Dried Fruit" amy@gldf.com growth
 */

import { getSanityClient } from "../src/lib/sanity";
import { generateAPIKey } from "../src/lib/api-auth";

async function main() {
  const [name, email, plan = "growth"] = process.argv.slice(2);

  if (!name) {
    console.error("Usage: npx tsx scripts/create-api-client.ts <name> [email] [plan]");
    console.error("Example: npx tsx scripts/create-api-client.ts 'Great Lakes Dried Fruit' amy@gldf.com growth");
    process.exit(1);
  }

  const sanity = getSanityClient();
  if (!sanity) {
    console.error("Sanity not configured. Set SANITY_API_TOKEN.");
    process.exit(1);
  }

  const apiKey = generateAPIKey();

  const client = await sanity.create({
    _type: "apiClient",
    name,
    apiKey,
    plan,
    active: true,
    createdAt: new Date().toISOString(),
    ownerEmail: email || undefined,
    usageThisMonth: 0,
  });

  console.log("\n✅ API Client created!\n");
  console.log(`Name:    ${name}`);
  console.log(`Plan:    ${plan}`);
  console.log(`API Key: ${apiKey}`);
  console.log(`ID:      ${client._id}`);
  console.log("\nAdd to client's .env.local:");
  console.log(`REB_API_KEY=${apiKey}`);
}

main().catch(console.error);
