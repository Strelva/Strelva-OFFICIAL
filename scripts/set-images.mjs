// Run with: node --loader ts-node/esm scripts/set-images.mjs
// Or just use the fetch approach below

const BASE = "http://localhost:3000";

// We need to bypass auth. Let's write directly via the storage module.
// But that requires TS compilation. Instead, let's use a simpler approach:
// hit the internal API with the right headers.

// Actually, the simplest approach: update Sanity directly using the API token.

import { createClient } from "@sanity/client";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "fcghwrak",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
  apiVersion: "2024-01-01",
});

async function updateImages() {
  const tenant = "rohlax";

  // Update story imageUrl
  const storyDoc = await client.fetch(
    `*[_type == "story" && tenant == $tenant][0]._id`,
    { tenant }
  );
  if (storyDoc) {
    await client.patch(storyDoc).set({ imageUrl: "/images/chelsea/portrait.jpg" }).commit();
    console.log("Story imageUrl updated:", storyDoc);
  } else {
    console.log("No story document found in Sanity");
  }

  // Update hero backgroundImageUrl
  const heroDoc = await client.fetch(
    `*[_type == "hero" && tenant == $tenant][0]._id`,
    { tenant }
  );
  if (heroDoc) {
    await client.patch(heroDoc).set({ backgroundImageUrl: "/images/chelsea/studio-wide.webp" }).commit();
    console.log("Hero backgroundImageUrl updated:", heroDoc);
  } else {
    console.log("No hero document found in Sanity");
  }

  // Also update hero ctaLink
  if (heroDoc) {
    await client.patch(heroDoc).set({ ctaLink: "https://www.vagaro.com/rohlaxwellness" }).commit();
    console.log("Hero ctaLink updated");
  }
}

updateImages().catch(console.error);
