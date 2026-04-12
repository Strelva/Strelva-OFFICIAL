import { getTenantConfig } from "./tenants";
import type { SubscriptionTier } from "./types";

// --- Capability definitions ---

export type CapabilityId = "website" | "analytics" | "email" | "blog" | "reviews" | "social";

export interface Capability {
  id: CapabilityId;
  name: string;
  description: string;
  tools: string[];
  available: boolean;
}

const CAPABILITY_DEFS: Record<CapabilityId, { name: string; description: string; tools: string[] }> = {
  website: {
    name: "Website Management",
    description: "Read, update, and manage all sections of your website",
    tools: ["read_section", "update_section", "upload_image"],
  },
  analytics: {
    name: "Analytics",
    description: "View site traffic, booking clicks, and activity history",
    tools: ["get_metrics", "get_activity"],
  },
  email: {
    name: "Email & Newsletter",
    description: "Send newsletters and manage subscribers",
    tools: ["send_newsletter", "list_subscribers"],
  },
  blog: {
    name: "Blog",
    description: "Write and publish blog posts",
    tools: ["create_post", "list_posts"],
  },
  reviews: {
    name: "Review Management",
    description: "Monitor and respond to reviews across platforms",
    tools: ["get_reviews", "respond_review"],
  },
  social: {
    name: "Social Media",
    description: "Draft and schedule social media posts from site content",
    tools: ["draft_social_post", "list_social_posts", "schedule_social_post"],
  },
};

// --- Tier → capability mapping ---

const TIER_CAPABILITIES: Record<SubscriptionTier, CapabilityId[]> = {
  starter: ["website", "analytics"],
  growth: ["website", "analytics", "email", "blog", "reviews"],
  scale: ["website", "analytics", "email", "blog", "reviews", "social"],
};

// v2 stubs — not yet implemented
const IMPLEMENTED_CAPABILITIES: Set<CapabilityId> = new Set([
  "website", "analytics", "email", "blog", "reviews", "social",
]);

export function getCapabilitiesForTier(tier: SubscriptionTier): Capability[] {
  const allowed = TIER_CAPABILITIES[tier];
  return Object.entries(CAPABILITY_DEFS).map(([id, def]) => ({
    id: id as CapabilityId,
    ...def,
    available: allowed.includes(id as CapabilityId),
  }));
}

export function getActiveCapabilityIds(tier: SubscriptionTier): CapabilityId[] {
  return TIER_CAPABILITIES[tier].filter((id) => IMPLEMENTED_CAPABILITIES.has(id));
}

export function getActiveTools(tier: SubscriptionTier): Set<string> {
  const tools = new Set<string>();
  for (const capId of getActiveCapabilityIds(tier)) {
    for (const tool of CAPABILITY_DEFS[capId].tools) {
      tools.add(tool);
    }
  }
  return tools;
}

export function isCapabilityLocked(capId: CapabilityId, tier: SubscriptionTier): boolean {
  return !TIER_CAPABILITIES[tier].includes(capId);
}

export function getUpgradeTier(capId: CapabilityId, currentTier: SubscriptionTier): SubscriptionTier | null {
  const tiers: SubscriptionTier[] = ["starter", "growth", "scale"];
  const currentIdx = tiers.indexOf(currentTier);

  for (let i = currentIdx + 1; i < tiers.length; i++) {
    if (TIER_CAPABILITIES[tiers[i]].includes(capId)) return tiers[i];
  }
  return null;
}

export async function getActivatedCapabilities(tenantId: string): Promise<{
  tier: SubscriptionTier;
  capabilities: Capability[];
  activeTools: Set<string>;
}> {
  const config = await getTenantConfig(tenantId);
  const tier = config?.tier || "starter";
  return {
    tier,
    capabilities: getCapabilitiesForTier(tier),
    activeTools: getActiveTools(tier),
  };
}

// --- System prompt fragment for active capabilities ---

export function capabilityPromptFragment(tier: SubscriptionTier): string {
  const active = getActiveCapabilityIds(tier);
  const locked = Object.keys(CAPABILITY_DEFS)
    .filter((id) => !active.includes(id as CapabilityId) && IMPLEMENTED_CAPABILITIES.has(id as CapabilityId)) as CapabilityId[];

  const lines = active.map((id) => {
    const def = CAPABILITY_DEFS[id];
    return `- ${def.name}: ${def.description}`;
  });

  let fragment = `ACTIVE CAPABILITIES (${tier} plan):\n${lines.join("\n")}`;

  if (locked.length > 0) {
    const lockedLines = locked.map((id) => `- ${CAPABILITY_DEFS[id].name}: available on Growth or Scale plan`);
    fragment += `\n\nLOCKED CAPABILITIES:\n${lockedLines.join("\n")}`;
    fragment += `\n\nWhen the user asks about locked capabilities, explain what they'd get and suggest upgrading. Don't pretend the feature doesn't exist.`;
  }

  return fragment;
}

// --- Tier pricing for upgrade prompts ---

export const TIER_PRICING: Record<SubscriptionTier, { price: number; label: string }> = {
  starter: { price: 49, label: "Starter" },
  growth: { price: 149, label: "Growth" },
  scale: { price: 399, label: "Scale" },
};
