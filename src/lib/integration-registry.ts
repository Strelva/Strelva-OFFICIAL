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
  understands_customers: "What customers say",
  understands_demand: "What people look for",
  understands_content: "What is on your site",
  can_take_action: "Things Strelva can do for you",
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
  /** False when Strelva has not added the provider's keys yet; absent means unknown. */
  platformReady?: boolean;
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
    displayName: "Visits to your site",
    providerId: "website-activity",
    shortDescription: "What visitors do on your site",
    description:
      "Website activity gives the AI a plain-English view of what visitors do: page visits, customer actions, and which offers get attention. It powers reports and helps the AI suggest site updates based on actual behavior instead of guesses.",
    icon: "WA",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "Live dashboard events",
    usedIn: "Weekly reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "Which pages people open and which buttons they press.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Website Activity What are visitors doing on my site that I should act on?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "reviews",
    displayName: "Reviews",
    providerId: "reviews",
    shortDescription: "What customers write about you",
    description:
      "Reviews give the AI customer language it can reuse in site copy, reports, and reply drafts. This source is built into the dashboard when reviews are stored, and any public response should be drafted or queued for approval.",
    icon: "RV",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Stored in dashboard",
    usedIn: "Chat, reports, suggestions, review replies",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What customers praise and repeat in their own words.",
    actionPaths: ["Writes a reply for your yes", "Suggests a review to quote on your site"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Reviews What customer language should my site use?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
  },
  {
    id: "booking-clicks",
    displayName: "Bookings and calls",
    providerId: "customer-actions",
    shortDescription: "Who clicks to book or call",
    description:
      "Customer actions show which parts of the website create intent. The AI uses this with site activity to suggest clearer CTAs, stronger product copy, and weekly report summaries.",
    icon: "CA",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Live dashboard events",
    usedIn: "Reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "Which pages lead people to book or call.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Customer Actions Which calls-to-action should I improve?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "uploads",
    displayName: "Photos and files",
    providerId: "uploads",
    shortDescription: "Photos and files you add",
    description:
      "Uploads give the AI recent photos, PDFs, and reference material it can use when drafting site content. The source is useful when a business wants the website to reflect real products, work, or documents.",
    icon: "UP",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On upload",
    usedIn: "Chat, content drafts, site updates",
    intelligenceCategory: "understands_content",
    addsIntelligence: "Your photos and files, for Strelva to use on your site.",
    appearsIn: ["Chat", "Site updates"],
    sourcePrompt: "@Uploads What should I do with my recent files?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "site-history",
    displayName: "History",
    providerId: "site-history",
    shortDescription: "What changed on your site and who changed it",
    description:
      "Site history gives the AI memory of recent updates, stale sections, and previous changes. It helps recommendations account for what was already changed instead of repeating old advice.",
    icon: "SH",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "After each approved change",
    usedIn: "Chat, reports, suggestions, site updates",
    intelligenceCategory: "understands_content",
    addsIntelligence: "What changed lately and which pages are getting old.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Site History What changed recently and what should be updated next?",
    builtIn: true,
    usesSignalInAi: true,
  },
  {
    id: "website",
    displayName: "Your website",
    providerId: "website",
    shortDescription: "Your site, changed only with your yes",
    description:
      "Website is the primary action path. The AI can draft and queue content changes to existing sections, then approved updates become the live site.",
    icon: "WB",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "On approved changes",
    usedIn: "Site updates, approvals, chat",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "Your pages as they are now. Strelva changes them only with your yes.",
    actionPaths: ["Writes a change for your yes", "Shows the page before it goes live"],
    appearsIn: ["Chat", "Suggestions", "Site updates"],
    sourcePrompt: "@Website What is the highest-impact site update to queue?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
  },
  {
    id: "booking-cta",
    displayName: "Your main button",
    providerId: "primary-cta",
    shortDescription: "Where your site asks people to book or call",
    description:
      "Primary CTA is the approval-gated place the AI can improve action language and links on the website. It does not invent a sales workflow; it helps the site send visitors to the right next step.",
    icon: "CTA",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On approved changes",
    usedIn: "Site updates, chat, reports",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "Where your site asks visitors to book, call or buy.",
    actionPaths: ["Suggests clearer button words for your yes"],
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
    shortDescription: "Emails to the people who signed up",
    description:
      "Newsletter gives the AI a place to draft customer updates from recent site changes, announcements, and seasonal promotions. Sending stays approval-gated; the useful first step is a reviewable draft.",
    icon: "NL",
    iconBg: "bg-[rgba(129,140,248,0.09)]",
    iconColor: "text-[#818cf8]",
    syncFrequency: "On demand",
    usedIn: "Email campaigns, subscriber management",
    intelligenceCategory: "understands_content",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What you have told customers, and what could be the next email.",
    actionPaths: ["Writes the next email for your yes"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Newsletter Draft an update based on the latest site changes.",
    canActWhenConnected: true,
    settingsKey: "newsletter",
  },
  {
    id: "google-search-console",
    displayName: "Google search",
    providerId: "google-search-console",
    shortDescription: "What people search before they find you",
    description:
      "Connect your Google Search Console to let your AI track how people find you on Google. See which search terms bring visitors, which pages rank highest, and get suggestions to improve your SEO. Powers your weekly \"how people found you\" report.",
    icon: "SC",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Every 24 hours",
    usedIn: "Weekly reports, SEO insights, AI suggestions",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What people search before they find you.",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Search Console What are people searching for that my site should mention?",
    usesSignalInAi: true,
    settingsKey: "googleSearchConsole",
    configField: "googleSearchConsoleKey",
  },
  {
    id: "google-business",
    displayName: "Google listing",
    providerId: "google",
    shortDescription: "Your listing, reviews and hours on Google",
    description:
      "Google Business gives the AI listing and review context it can use when suggesting site updates, testimonial copy, and review replies. Direct listing changes should be suggested or queued for review unless the approved action path exists.",
    icon: "GB",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Daily sync",
    usedIn: "Reviews, business listing, hours",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What people see on Google, and whether it matches your site.",
    actionPaths: ["Writes review replies for your yes", "Suggests listing updates", "Keeps your site's hours in step with your listing"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Google Business Any review or listing updates I should act on?",
    connectionProvider: "google",
  },
  {
    id: "instagram",
    displayName: "Instagram",
    providerId: "instagram",
    shortDescription: "Your recent posts, read only",
    description:
      "Instagram gives the AI the business's recent public posts as content context. Strelva does not post to Instagram.",
    icon: "IG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On demand + scheduled",
    usedIn: "Social media, content marketing",
    intelligenceCategory: "understands_content",
    addsIntelligence: "What you have posted on Instagram lately.",
    actionPaths: [],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Instagram What have we posted recently?",
    connectionProvider: "instagram",
    settingsKey: "instagram",
  },
  {
    id: "calendly",
    displayName: "Calendly",
    providerId: "calendly",
    shortDescription: "Where people book with you",
    description:
      "Calendly helps the AI understand where booking intent goes after someone clicks. Until full availability sync is supported, the AI should suggest booking-page and CTA changes instead of promising to manage the calendar.",
    icon: "CL",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Configured booking link",
    usedIn: "Booking, scheduling, availability",
    intelligenceCategory: "understands_demand",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "Which booking page your site sends people to.",
    actionPaths: ["Suggests booking button words", "Keeps your booking link up to date on your site"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Booking CTA Is my booking path clear enough?",
    connectionProvider: "calendly",
    settingsKey: "calendly",
  },
  {
    id: "yelp",
    displayName: "Yelp",
    providerId: "yelp",
    shortDescription: "Your Yelp reviews; you post replies on Yelp",
    description:
      "Strelva reads your recent Yelp reviews once a day with the Yelp API key you add. It can draft a reply for you, but Yelp has no way for apps to post replies, so you post it on Yelp yourself.",
    icon: "YP",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Once a day",
    usedIn: "Review management, reputation",
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "What customers say about you on Yelp.",
    actionPaths: ["Writes a Yelp reply for you to post", "Suggests a review to quote on your site"],
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
