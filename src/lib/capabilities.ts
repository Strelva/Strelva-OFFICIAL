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
export type AgentSurface = "chat" | "background";

export const AGENT_TOOL_CATALOG = {
  read_section: ["chat", "background"],
  update_section: ["chat", "background"],
  undo_last_change: ["chat", "background"],
  request_custom_change: ["chat"],
  upload_image: ["chat"],
  get_metrics: ["chat"],
  explain_traffic: ["chat"],
  get_activity: ["chat"],
  get_suggestions: ["chat", "background"],
  create_suggestion: ["chat", "background"],
  draft_newsletter: ["chat"],
  list_subscribers: ["chat"],
  create_gbp_post: ["chat", "background"],
  update_business_hours: ["chat", "background"],
  upload_gbp_photo: ["chat", "background"],
  draft_social_post: ["chat"],
  list_social_posts: ["chat"],
  get_reviews: ["chat"],
  reply_to_review: ["chat"],
  toggle_section_visibility: ["chat"],
  reorder_sections: ["chat"],
  show_report: ["chat"],
  show_content: ["chat"],
  show_photos: ["chat"],
  show_connections: ["chat"],
  preview_site: ["chat"],
  list_entries: ["chat"],
  save_entry: ["chat"],
  create_blog_post: ["background"],
  list_blog_posts: ["background"],
} as const satisfies Record<string, readonly AgentSurface[]>;

export type AgentToolId = keyof typeof AGENT_TOOL_CATALOG;

const ALL_CAPABILITIES: CapabilityId[] = ["website", "analytics", "email", "blog", "reviews", "social", "google_business"];

export interface Capability {
  id: CapabilityId;
  name: string;
  description: string;
  tools: AgentToolId[];
  available: boolean;
}

const CAPABILITY_DEFS: Record<CapabilityId, { name: string; description: string; tools: AgentToolId[] }> = {
  website: {
    name: "Website Management",
    description:
      "Read, update, and manage all sections of your website, including undoing the last change (revert to an earlier version), which is drafted for your approval before it goes live",
    tools: ["read_section", "update_section", "undo_last_change", "request_custom_change", "upload_image", "toggle_section_visibility", "reorder_sections", "show_content", "show_photos", "preview_site"],
  },
  analytics: {
    name: "Analytics",
    description: "View site traffic, booking clicks, and activity history",
    tools: ["get_metrics", "explain_traffic", "get_activity", "show_report"],
  },
  email: {
    name: "Email & Newsletter",
    description: "Draft newsletters for review and inspect subscribers",
    tools: ["draft_newsletter", "list_subscribers"],
  },
  blog: {
    name: "Blog",
    description: "List and save collection-backed blog entries",
    tools: ["save_entry", "list_entries"],
  },
  reviews: {
    name: "Review Management",
    description: "Monitor reviews and queue governed replies",
    tools: ["get_reviews", "reply_to_review"],
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
      "Draft Google Business posts, hours updates, and photos, each queued for your approval before it publishes to Google",
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

export function getAllTools(surface: AgentSurface = "chat"): Set<AgentToolId> {
  return new Set(
    (Object.entries(AGENT_TOOL_CATALOG) as Array<[AgentToolId, readonly AgentSurface[]]>)
      .filter(([, surfaces]) => surfaces.includes(surface))
      .map(([tool]) => tool),
  );
}

export function assertAgentToolCatalog(toolNames: string[], surface: AgentSurface): void {
  for (const name of toolNames) {
    const surfaces = (AGENT_TOOL_CATALOG as Record<string, readonly AgentSurface[]>)[name];
    if (!surfaces?.includes(surface)) {
      throw new Error(`Agent tool "${name}" is not registered for the ${surface} surface`);
    }
  }
}

// --- System prompt fragment for capabilities ---

export function capabilityPromptFragment(): string {
  const lines = ALL_CAPABILITIES.map((id) => {
    const def = CAPABILITY_DEFS[id];
    return `- ${def.name}: ${def.description}`;
  });

  return `CAPABILITIES:\n${lines.join("\n")}`;
}
