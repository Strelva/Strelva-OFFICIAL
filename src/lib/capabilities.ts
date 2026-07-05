// --- Capability definitions ---

/**
 * Sanitize a tenant-controlled string before interpolating it into the agent
 * system prompt. Tenant content (owner name, contact fields, headlines, etc.)
 * is attacker-controllable, so a raw multiline value could inject fake
 * instruction lines into the prompt. Collapse CR/LF/tab and any other C0
 * control char (plus DEL) to a space, squash runs of whitespace, and cap the
 * length so a single field can't blow up the prompt or smuggle in a directive
 * on its own line.
 */
export function sanitizePromptValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 400);
}

export type CapabilityId = "website" | "analytics" | "email" | "blog" | "reviews" | "social" | "google_business";

const ALL_CAPABILITIES: CapabilityId[] = ["website", "analytics", "email", "blog", "reviews", "social", "google_business"];

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
    description:
      "Read, update, and manage all sections of your website — including undoing the last change (revert to an earlier version), which is drafted for your approval before it goes live",
    tools: ["read_section", "update_section", "undo_last_change", "upload_image"],
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
    description: "Draft social media posts from site content",
    tools: ["draft_social_post", "list_social_posts"],
  },
  google_business: {
    name: "Google Business",
    // Every Google-listing write is drafted and queued for the owner's
    // approval before it publishes — the approve-before-live trust spine.
    description:
      "Draft Google Business posts, hours updates, and photos — each queued for your approval before it publishes to Google",
    tools: ["create_gbp_post", "update_business_hours", "upload_gbp_photo"],
  },
};

// --- Single plan: all capabilities included ---

export function getAllCapabilities(): Capability[] {
  return Object.entries(CAPABILITY_DEFS).map(([id, def]) => ({
    id: id as CapabilityId,
    ...def,
    available: true,
  }));
}

export function getAllTools(): Set<string> {
  const tools = new Set<string>();
  for (const capId of ALL_CAPABILITIES) {
    for (const tool of CAPABILITY_DEFS[capId].tools) {
      tools.add(tool);
    }
  }
  return tools;
}

export async function getActivatedCapabilities(_tenantId: string): Promise<{
  capabilities: Capability[];
  activeTools: Set<string>;
}> {
  return {
    capabilities: getAllCapabilities(),
    activeTools: getAllTools(),
  };
}

// --- System prompt fragment for capabilities ---

export function capabilityPromptFragment(): string {
  const lines = ALL_CAPABILITIES.map((id) => {
    const def = CAPABILITY_DEFS[id];
    return `- ${def.name}: ${def.description}`;
  });

  return `CAPABILITIES:\n${lines.join("\n")}`;
}
