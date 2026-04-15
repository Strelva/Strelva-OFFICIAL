#!/usr/bin/env node
/**
 * One-shot script: hide the "story" section on gldf's home page in Sanity.
 * Usage: node scripts/hide-story-section.mjs
 */
import { createClient } from "@sanity/client";
import { readFileSync } from "fs";

// Manual env loading since dotenv isn't installed
const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] ??= match[2].trim();
}

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

const tenant = "gldf";

// Fetch stored page config
const doc = await client.fetch(
  `*[_type == "pageConfig" && tenant == $tenant][0]`,
  { tenant }
);

if (!doc) {
  console.log("No stored pageConfig for gldf — the default in index.ts will apply.");
  process.exit(0);
}

console.log("Found pageConfig doc:", doc._id);
const pages = doc.pages;

if (!pages?.home?.sections) {
  console.log("No home sections found in stored config.");
  process.exit(1);
}

const storySection = pages.home.sections.find((s) => s.type === "story");
if (!storySection) {
  console.log("No story section in home config.");
  process.exit(0);
}

if (!storySection.visible) {
  console.log("Story section is already hidden.");
  process.exit(0);
}

// Set visible: false
storySection.visible = false;

await client.patch(doc._id).set({ pages }).commit();
console.log("Done — story section hidden on gldf home page.");
