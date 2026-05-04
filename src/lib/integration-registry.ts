import type { IntegrationProvider } from "./types";

export type IntegrationStatus =
  | "connected"
  | "not_configured"
  | "sync_failed"
  | "needs_reauth"
  | "coming_soon"
  | "unknown";

export interface IntegrationUsageExample {
  title: string;
  prompt: string;
  response: string;
}

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
  usageExamples: IntegrationUsageExample[];
  connectionProvider?: IntegrationProvider;
  settingsKey?: string;
  configField?: string;
  availability?: "available" | "coming_soon";
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

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id: "google-analytics",
    displayName: "Google Analytics",
    providerId: "google-analytics",
    shortDescription: "Traffic data for reports & AI suggestions",
    description:
      "Your AI reads your Google Analytics data and turns it into plain-English insights you can actually use. It powers your weekly report (\"47 people found you this week\"), surfaces which pages are working, spots trends, and suggests actions - like adding a call-to-action to your most-visited page. No dashboards to learn. No numbers to interpret. Just ask.",
    icon: "GA",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "Every 24 hours",
    usedIn: "Weekly reports, AI suggestions, chat",
    usageExamples: [
      {
        title: "@Analytics: how did my site do this week?",
        prompt: "@Analytics: how did my site do this week?",
        response:
          "Your site had 47 visitors this week, up 12% from last week. Your Services page got the most views (28). 3 people clicked Book Now - all on Tuesday after you posted about the new class.",
      },
      {
        title: "@Analytics: which page gets the most traffic?",
        prompt: "@Analytics: which page gets the most traffic?",
        response:
          "Your Services page is your top performer with 28 views this week. Want me to add a stronger call-to-action on Services?",
      },
    ],
  },
  {
    id: "newsletter",
    displayName: "Newsletter",
    providerId: "newsletter",
    shortDescription: "AI drafts & sends email to subscribers",
    description:
      "Your AI drafts and sends email newsletters to your subscriber list. Tell it what to write about and it'll create a professional email, preview it for your approval, and send it when you say go. Great for monthly updates, new service announcements, or seasonal promotions.",
    icon: "NL",
    iconBg: "bg-[rgba(129,140,248,0.09)]",
    iconColor: "text-[#818cf8]",
    syncFrequency: "On demand",
    usedIn: "Email campaigns, subscriber management",
    settingsKey: "newsletter",
    usageExamples: [
      {
        title: "Send an update about my new class",
        prompt: "Send an update to subscribers about my new Saturday yoga class",
        response:
          "I've drafted a newsletter about your Saturday Morning Yoga class. It highlights the 8AM start time, the 75-minute grounding practice, and includes a Book Now button. Want me to send it?",
      },
      {
        title: "How many subscribers do I have?",
        prompt: "How many newsletter subscribers do I have?",
        response:
          "You have 142 active subscribers. Your last email had a 34% open rate, which is above average for small businesses. Want me to send another update?",
      },
    ],
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
    settingsKey: "googleSearchConsole",
    configField: "googleSearchConsoleKey",
    usageExamples: [
      {
        title: "What are people searching to find me?",
        prompt: "What search terms bring people to my site?",
        response:
          "Your top searches this week: 'yoga studio downtown' (23 clicks), 'morning yoga class' (15 clicks), 'beginner yoga near me' (8 clicks). Your 'Services' page ranks #3 for 'yoga studio downtown.'",
      },
      {
        title: "How can I rank higher?",
        prompt: "How can I improve my Google ranking?",
        response:
          "You're showing up for 'beginner yoga' but not getting clicks - your title might be too generic. Want me to update it to 'Beginner-Friendly Yoga Classes | [Your Studio]'?",
      },
    ],
  },
  {
    id: "google-business",
    displayName: "Google Business",
    providerId: "google",
    shortDescription: "Sync reviews & keep your listing current",
    description:
      "Connect your Google Business Profile so your AI can keep your listing up to date, respond to reviews, and sync your hours automatically. When you update your site, your Google listing updates too.",
    icon: "GB",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Daily sync",
    usedIn: "Reviews, business listing, hours",
    connectionProvider: "google",
    usageExamples: [
      {
        title: "Respond to my latest review",
        prompt: "Respond to my latest Google review",
        response:
          "You got a 5-star review from Sarah M: \"Best yoga studio in town!\" I've drafted a reply thanking her and mentioning your new Saturday class. Want me to post it?",
      },
      {
        title: "Are my Google hours up to date?",
        prompt: "Check if my Google Business hours match my site",
        response:
          "Your Google listing shows Mon-Fri 6am-8pm but your site says 7am-9pm. Want me to update Google to match?",
      },
    ],
  },
  {
    id: "instagram",
    displayName: "Instagram",
    providerId: "instagram",
    shortDescription: "Auto-post from your site's content",
    description:
      "Let your AI auto-post to Instagram from your site's content. When you add a new blog post, service, or event, it can create and schedule an Instagram post with the right hashtags and a compelling caption.",
    icon: "IG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On demand + scheduled",
    usedIn: "Social media, content marketing",
    connectionProvider: "instagram",
    settingsKey: "instagram",
    usageExamples: [
      {
        title: "Post about my new class",
        prompt: "Create an Instagram post about my Saturday yoga class",
        response:
          "I've created a post with your class photo, a caption about the grounding practice, and relevant hashtags. Scheduled for Thursday at 10am when your followers are most active.",
      },
      {
        title: "What should I post this week?",
        prompt: "Suggest Instagram content for this week",
        response:
          "Based on your upcoming schedule: Monday - behind-the-scenes studio prep. Wednesday - client testimonial. Friday - Saturday class reminder with early-bird CTA.",
      },
    ],
  },
  {
    id: "calendly",
    displayName: "Calendly",
    providerId: "calendly",
    shortDescription: "Sync availability & track appointments",
    description:
      "Sync your Calendly availability with your site. Your AI can check your schedule, suggest appointment times to clients, and automatically update your site's booking links.",
    icon: "CL",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Real-time sync",
    usedIn: "Booking, scheduling, availability",
    connectionProvider: "calendly",
    settingsKey: "calendly",
    usageExamples: [
      {
        title: "When am I free this week?",
        prompt: "Check my availability for Thursday",
        response:
          "You have openings at 10am, 1pm, and 3:30pm on Thursday. Want me to send a booking link to a specific client?",
      },
      {
        title: "Update my booking page",
        prompt: "Add a 30-minute consultation option to my booking",
        response:
          "I've added a '30-min Free Consultation' option to your Calendly. It's now showing on your site's booking page too.",
      },
    ],
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
    connectionProvider: "yelp",
    usageExamples: [
      {
        title: "Any new Yelp reviews?",
        prompt: "Check for new Yelp reviews",
        response:
          "You got 2 new reviews this week - both 5 stars! One mentions your instructor by name. Want me to draft thank-you responses?",
      },
      {
        title: "What's my Yelp rating?",
        prompt: "What's my current Yelp rating?",
        response:
          "You're at 4.7 stars from 38 reviews. Your highest-rated aspect is 'friendly staff.' Your competitors average 4.2 stars.",
      },
    ],
  },
  {
    id: "vegaro",
    displayName: "Vegaro",
    providerId: "vegaro",
    shortDescription: "Booking notifications and calendar sync",
    description:
      "Connect your Vegaro booking system to receive instant notifications when clients book appointments. Your AI can confirm bookings, send reminders, and keep your calendar in sync.",
    icon: "VG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Real-time webhooks",
    usedIn: "Booking notifications, calendar sync",
    connectionProvider: "vegaro",
    availability: "coming_soon",
    usageExamples: [
      {
        title: "Any new bookings today?",
        prompt: "Do I have any new bookings?",
        response:
          "You have 3 new bookings today: Sarah M. at 10am, James K. at 2pm, and Emily R. at 4:30pm. All confirmed.",
      },
      {
        title: "Who's coming in tomorrow?",
        prompt: "Show me tomorrow's schedule",
        response:
          "Tomorrow you have 5 appointments starting at 9am. Your busiest time is 1-3pm. Want me to send reminder texts to your clients?",
      },
    ],
  },
];

export const DISCOVERABLE_INTEGRATIONS = INTEGRATION_REGISTRY;

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

  if (definition.availability === "coming_soon") {
    return "coming_soon";
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
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}
