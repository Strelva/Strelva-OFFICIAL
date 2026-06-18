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

export type CapabilityId = "website" | "analytics" | "email" | "blog" | "reviews" | "social";

const ALL_CAPABILITIES: CapabilityId[] = ["website", "analytics", "email", "blog", "reviews", "social"];

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
