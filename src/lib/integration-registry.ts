import type { IntegrationProvider } from "./types";

export type IntegrationStatus =
  | "connected"
  | "not_configured"
  | "sync_failed"
  | "needs_reauth"
  | "unknown";

export type IntelligenceCategory =
  | "understands_customers"
  | "understands_demand"
  | "understands_content"
  | "can_take_action";

export type IntelligenceStatus =
  | "no_signal"
  | "signal_available"
  | "ai_using_it"
  | "needs_attention"
  | "can_act_here";

export const INTELLIGENCE_CATEGORY_LABELS: Record<IntelligenceCategory, string> = {
  understands_customers: "Customer signals",
  understands_demand: "Demand signals",
  understands_content: "Content signals",
  can_take_action: "Can Take Action",
};

export interface IntegrationDefinition {
  id: string;
  displayName: string;
  providerId: string;
  description: string;
  shortDescription: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  syncFrequency: string;
  usedIn: string;
  intelligenceCategory: IntelligenceCategory;
  additionalIntelligenceCategories?: IntelligenceCategory[];
  addsIntelligence: string;
  actionPaths?: string[];
  appearsIn: string[];
  sourcePrompt?: string;
  builtIn?: boolean;
  usesSignalInAi?: boolean;
  canActWhenConnected?: boolean;
  connectionProvider?: IntegrationProvider;
  settingsKey?: string;
  configField?: string;
}

export interface RawConnectionStatus {
  provider?: string;
  connected?: boolean;
  lastSyncedAt?: string | null;
  status?: string | null;
}

export type RawTenantConnectionSettings = Record<string, boolean | undefined>;

export interface IntegrationStatusInput {
  connection?: RawConnectionStatus | null;
  settings?: RawTenantConnectionSettings | null;
  connectionLoaded?: boolean;
  settingsLoaded?: boolean;
}

export function getIntegrationCategories(definition: IntegrationDefinition): IntelligenceCategory[] {
  return [definition.intelligenceCategory, ...(definition.additionalIntelligenceCategories ?? [])];
}

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id: "website-activity",
    displayName: "Website Activity",
    providerId: "website-activity",
    shortDescription: "Visitor and click signals from the site",
    description:
      "Website activity gives the AI a plain-English view of what visitors do: page visits, customer actions, and which offers get attention. It powers reports and helps the AI suggest site updates based on actual behavior instead of guesses.",
    icon: "WA",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "Live dashboard events",
    usedIn: "Weekly reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What visitors do on the site and which calls-to-action they click.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Website Activity What are visitors doing on my site that I should act on?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "reviews",
    displayName: "Reviews",
    providerId: "reviews",
    shortDescription: "Stored customer language and reply drafts",
    description:
      "Reviews give the AI customer language it can reuse in site copy, reports, and reply drafts. This source is built into the dashboard when reviews are stored, and any public response should be drafted or queued for approval.",
    icon: "RV",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Stored in dashboard",
    usedIn: "Chat, reports, suggestions, review replies",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What customers praise, object to, and repeat in their own words.",
    actionPaths: ["Draft review reply", "Suggest testimonial copy", "Queue site proof update"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Reviews What customer language should my site use?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
  },
  {
    id: "booking-clicks",
    displayName: "Customer Actions",
    providerId: "customer-actions",
    shortDescription: "Which pages and buttons create customer intent",
    description:
      "Customer actions show which parts of the website create intent. The AI uses this with site activity to suggest clearer CTAs, stronger product copy, and weekly report summaries.",
    icon: "CA",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Live dashboard events",
    usedIn: "Reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "Which offers, pages, and buttons create customer intent.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Customer Actions Which calls-to-action should I improve?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "uploads",
    displayName: "Uploads",
    providerId: "uploads",
    shortDescription: "Photos and files the AI can reference",
    description:
      "Uploads give the AI recent photos, PDFs, and reference material it can use when drafting site content. The source is useful when a business wants the website to reflect real products, work, or documents.",
    icon: "UP",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On upload",
    usedIn: "Chat, content drafts, site updates",
    intelligenceCategory: "understands_content",
    addsIntelligence: "Recent photos and files the AI can use as content context.",
    appearsIn: ["Chat", "Site updates"],
    sourcePrompt: "@Uploads What should I do with my recent files?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "site-history",
    displayName: "Site History",
    providerId: "site-history",
    shortDescription: "What changed on the site and why",
    description:
      "Site history gives the AI memory of recent updates, stale sections, and previous changes. It helps recommendations account for what was already changed instead of repeating old advice.",
    icon: "SH",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "After each approved change",
    usedIn: "Chat, reports, suggestions, site updates",
    intelligenceCategory: "understands_content",
    addsIntelligence: "What changed recently and which site sections may be stale.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Site History What changed recently and what should be updated next?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "website",
    displayName: "Website",
    providerId: "website",
    shortDescription: "The approval-gated place the AI can update",
    description:
      "Website is the primary action path. The AI can draft and queue content changes to existing sections, then approved updates become the live site.",
    icon: "WB",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "On approved changes",
    usedIn: "Site updates, approvals, chat",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "The current live site structure and content the AI can edit with approval.",
    actionPaths: ["Draft site update", "Queue change for approval", "Preview changed section"],
    appearsIn: ["Chat", "Suggestions", "Site updates"],
    sourcePrompt: "@Website What is the highest-impact site update to queue?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
  },
  {
    id: "social",
    displayName: "Social",
    providerId: "social",
    shortDescription: "Draft social content from site updates",
    description:
      "Social is an approval-gated action path for turning website changes, photos, and promotions into draft posts. It should be treated as draft-and-review unless a connected posting channel is explicitly available.",
    icon: "SO",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On demand",
    usedIn: "Chat, suggestions",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "Which current site updates could become public social content.",
    actionPaths: ["Draft social post", "Queue post for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Social Draft a post from the latest site update.",
    builtIn: true,
    canActWhenConnected: true,
  },
  {
    id: "booking-cta",
    displayName: "Primary CTA",
    providerId: "primary-cta",
    shortDescription: "The site action path for customer intent",
    description:
      "Primary CTA is the approval-gated place the AI can improve action language and links on the website. It does not invent a sales workflow; it helps the site send visitors to the right next step.",
    icon: "CTA",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On approved changes",
    usedIn: "Site updates, chat, reports",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "Where the site asks visitors to shop, contact, subscribe, or take the next step.",
    actionPaths: ["Draft CTA update", "Queue site change for review"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Primary CTA Is my site action path clear enough?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
  },
  {
    id: "newsletter",
    displayName: "Newsletter",
    providerId: "newsletter",
    shortDescription: "Email context and draftable subscriber updates",
    description:
      "Newsletter gives the AI a place to draft customer updates from recent site changes, announcements, and seasonal promotions. Sending stays approval-gated; the useful first step is a reviewable draft.",
    icon: "NL",
    iconBg: "bg-[rgba(129,140,248,0.09)]",
    iconColor: "text-[#818cf8]",
    syncFrequency: "On demand",
    usedIn: "Email campaigns, subscriber management",
    intelligenceCategory: "understands_content",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What customers have been told and what can become a subscriber update.",
    actionPaths: ["Draft newsletter for approval", "Queue subscriber update for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Newsletter Draft an update based on the latest site changes.",
    canActWhenConnected: true,
    settingsKey: "newsletter",
  },
  {
    id: "google-search-console",
    displayName: "Google Search Console",
    providerId: "google-search-console",
    shortDescription: "Search terms and SEO performance",
    description:
      "Connect your Google Search Console to let your AI track how people find you on Google. See which search terms bring visitors, which pages rank highest, and get suggestions to improve your SEO. Powers your weekly \"how people found you\" report.",
    icon: "SC",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Every 24 hours",
    usedIn: "Weekly reports, SEO insights, AI suggestions",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What people search before finding you.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Search Console What are people searching for that my site should mention?",
    usesSignalInAi: true,
    settingsKey: "googleSearchConsole",
    configField: "googleSearchConsoleKey",
  },
  {
    id: "google-business",
    displayName: "Google Business",
    providerId: "google",
    shortDescription: "Reviews and listing context from Google",
    description:
      "Google Business gives the AI listing and review context it can use when suggesting site updates, testimonial copy, and review replies. Direct listing changes should be suggested or queued for review unless the approved action path exists.",
    icon: "GB",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Daily sync",
    usedIn: "Reviews, business listing, hours",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What customers say publicly and whether listing details match the site.",
    actionPaths: ["Draft review reply", "Suggest listing updates", "Queue site copy changes"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Google Business Any review or listing updates I should act on?",
    connectionProvider: "google",
  },
  {
    id: "instagram",
    displayName: "Instagram",
    providerId: "instagram",
    shortDescription: "Public content context and draftable social posts",
    description:
      "Instagram gives the AI public content context and a channel for draft social posts. Posting should stay reviewable; the first useful behavior is turning site updates, customer language, and photos into a draft caption.",
    icon: "IG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On demand + scheduled",
    usedIn: "Social media, content marketing",
    intelligenceCategory: "understands_content",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What the business is saying publicly and what site updates could become social content.",
    actionPaths: ["Draft social post", "Queue scheduled post for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Instagram What should we turn into a social post this week?",
    connectionProvider: "instagram",
    settingsKey: "instagram",
  },
  {
    id: "calendly",
    displayName: "Calendly",
    providerId: "calendly",
    shortDescription: "Booking flow context and appointment demand signals",
    description:
      "Calendly helps the AI understand where booking intent goes after someone clicks. Until full availability sync is supported, the AI should suggest booking-page and CTA changes instead of promising to manage the calendar.",
    icon: "CL",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Configured booking link",
    usedIn: "Booking, scheduling, availability",
    intelligenceCategory: "understands_demand",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "Which booking path the site sends interested visitors to.",
    actionPaths: ["Suggest booking CTA update", "Queue website booking-link copy changes"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Booking CTA Is my booking path clear enough?",
    connectionProvider: "calendly",
    settingsKey: "calendly",
  },
  {
    id: "yelp",
    displayName: "Yelp",
    providerId: "yelp",
    shortDescription: "Monitor & respond to Yelp reviews",
    description:
      "Monitor and respond to your Yelp reviews through your AI. Get notified when new reviews come in, draft professional responses, and keep your Yelp listing accurate.",
    icon: "YP",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Every 12 hours",
    usedIn: "Review management, reputation",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "Customer language and reputation signals from Yelp reviews.",
    actionPaths: ["Draft Yelp review reply", "Suggest site proof copy"],
    appearsIn: ["Chat", "Reports", "Suggestions"],
    sourcePrompt: "@Yelp What customer language should my site reuse?",
    connectionProvider: "yelp",
  },
  // Vegaro was here as a `coming_soon` placeholder. Removed — it occupied
  // real estate on the Sources page for a connection that wasn't actually
  // available. Re-add when the integration is built.
];

export const DISCOVERABLE_INTEGRATIONS = INTEGRATION_REGISTRY;

/**
 * Just the connectable accounts — the ones an owner actually links to expand what
 * Strelva can see and manage (Google Business, Search Console, Instagram, Calendly,
 * Yelp). Excludes the built-in/derived signals (website activity, uploads, history),
 * which are the owner's *context* and live in Brand Kit, not Integrations.
 */
export const CONNECTABLE_INTEGRATIONS = INTEGRATION_REGISTRY.filter(
  (i) => Boolean(i.connectionProvider) || Boolean(i.configField),
);

export function getIntegrationDefinition(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((integration) => integration.id === id);
}

export function normalizeIntegrationStatus(
  definition: IntegrationDefinition,
  input: IntegrationStatusInput = {}
): IntegrationStatus {
  const rawStatus = input.connection?.status?.toLowerCase();

  if (input.connection?.connected === true || rawStatus === "connected") {
    return "connected";
  }

  if (
    rawStatus &&
    ["needs_reauth", "reauth_required", "requires_reauth", "token_expired", "expired", "unauthorized"].includes(rawStatus)
  ) {
    return "needs_reauth";
  }

  if (rawStatus && ["error", "sync_failed", "failed"].includes(rawStatus)) {
    return "sync_failed";
  }

  if (definition.builtIn) {
    return "connected";
  }

  if (definition.connectionProvider) {
    if (input.connectionLoaded === false && !definition.settingsKey) {
      return "unknown";
    }
    if (input.connection && input.connection.connected === false) {
      return "not_configured";
    }
  }

  if (definition.settingsKey) {
    if (input.settings?.[definition.settingsKey] === true) {
      return "connected";
    }
    if (input.settingsLoaded === false && !definition.connectionProvider) {
      return "unknown";
    }
  }

  return "not_configured";
}

export function deriveIntelligenceStatus(
  definition: IntegrationDefinition,
  status: IntegrationStatus
): IntelligenceStatus {
  if (status === "needs_reauth" || status === "sync_failed") {
    return "needs_attention";
  }

  if (definition.builtIn) {
    if (definition.canActWhenConnected) return "can_act_here";
    if (definition.usesSignalInAi) return "ai_using_it";
    return "signal_available";
  }

  if (status !== "connected") {
    return "no_signal";
  }

  if (definition.canActWhenConnected) return "can_act_here";
  if (definition.usesSignalInAi) return "ai_using_it";
  return "signal_available";
}

export function filterIntegrations(
  integrations: IntegrationDefinition[],
  query: string
): IntegrationDefinition[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return integrations;

  return integrations.filter((integration) =>
    [
      integration.displayName,
      integration.providerId,
      integration.id,
      integration.description,
      integration.shortDescription,
      integration.addsIntelligence,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}
