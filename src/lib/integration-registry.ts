import type { IntegrationProvider } from "./types";

export type IntegrationStatus =
  | "connected"
  | "not_configured"
  | "sync_failed"
  | "needs_reauth"
  | "coming_soon"
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
  understands_customers: "Understands Customers",
  understands_demand: "Understands Demand",
  understands_content: "Understands Content",
  can_take_action: "Can Take Action",
};

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
  intelligenceCategory: IntelligenceCategory;
  additionalIntelligenceCategories?: IntelligenceCategory[];
  addsIntelligence: string;
  aiCanUseThisTo: string[];
  exampleInsight: string;
  actionPaths?: string[];
  appearsIn: string[];
  sourcePrompt?: string;
  builtIn?: boolean;
  usesSignalInAi?: boolean;
  canActWhenConnected?: boolean;
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
      "Website activity gives the AI a plain-English view of what visitors do: page visits, booking clicks, and which offers get attention. It powers reports and helps the AI suggest site updates based on actual behavior instead of guesses.",
    icon: "WA",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
    syncFrequency: "Live dashboard events",
    usedIn: "Weekly reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What visitors do on the site and which calls-to-action they click.",
    aiCanUseThisTo: [
      "explain which pages and offers are getting attention",
      "suggest clearer calls-to-action when booking clicks are low",
      "turn weekly traffic changes into plain-English next steps",
    ],
    exampleInsight:
      "Booking clicks dropped this week even though visits stayed steady. Want me to test a clearer booking CTA on the homepage?",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Website Activity What are visitors doing on my site that I should act on?",
    builtIn: true,
    usesSignalInAi: true,
    usageExamples: [
      {
        title: "@Analytics: how did my site do this week?",
        prompt: "@Analytics: how did my site do this week?",
        response:
          "Your site had 47 visitors this week, up 12% from last week. Your main offer got the most views (28). 3 people clicked your primary call-to-action after your latest update.",
      },
      {
        title: "@Analytics: which page gets the most traffic?",
        prompt: "@Analytics: which page gets the most traffic?",
        response:
          "Your main offer is your top performer with 28 views this week. Want me to test a clearer call-to-action there?",
      },
    ],
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
    aiCanUseThisTo: [
      "draft review replies for approval",
      "pull testimonial language into the website",
      "spot repeated objections worth addressing in site copy",
    ],
    exampleInsight:
      "Three reviews mention fast response time. Want me to add that proof near the contact CTA?",
    actionPaths: ["Draft review reply", "Suggest testimonial copy", "Queue site proof update"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Reviews What customer language should my site use?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
    usageExamples: [
      {
        title: "Use customer language",
        prompt: "@Reviews What should my site say based on customer reviews?",
        response:
          "Customers keep mentioning fast response time and personal service. Want me to draft homepage proof copy around those themes?",
      },
      {
        title: "Draft a reply",
        prompt: "Draft a reply to my latest review",
        response:
          "I drafted a short reply that thanks the customer, references what they valued, and keeps the tone personal. Want me to queue it for review?",
      },
    ],
  },
  {
    id: "booking-clicks",
    displayName: "Booking Clicks",
    providerId: "booking-clicks",
    shortDescription: "Which offers turn visitors into booking intent",
    description:
      "Booking clicks show which parts of the website create intent. The AI uses this with site activity to suggest clearer CTAs, stronger offer copy, and weekly report summaries.",
    icon: "BK",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Live dashboard events",
    usedIn: "Reports, AI suggestions, chat",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "Which offers, pages, and buttons create booking intent.",
    aiCanUseThisTo: [
      "explain whether visitors are taking the next step",
      "suggest CTA copy when booking clicks are weak",
      "compare service interest against site traffic",
    ],
    exampleInsight:
      "People view the services page but rarely click Book Now. Want me to suggest a stronger CTA for that section?",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Booking Clicks Which calls-to-action should I improve?",
    builtIn: true,
    usesSignalInAi: true,
    usageExamples: [
      {
        title: "Improve booking clicks",
        prompt: "@Booking Clicks Which calls-to-action should I improve?",
        response:
          "Your services page gets attention but fewer booking clicks. I can suggest a clearer button label and stronger proof nearby.",
      },
    ],
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
    aiCanUseThisTo: [
      "draft copy around uploaded photos or documents",
      "suggest where new visuals belong on the site",
      "keep site content grounded in real business assets",
    ],
    exampleInsight:
      "You uploaded new product photos. Want me to suggest which homepage section should use them?",
    appearsIn: ["Chat", "Site updates"],
    sourcePrompt: "@Uploads What should I do with my recent files?",
    builtIn: true,
    usesSignalInAi: true,
    usageExamples: [
      {
        title: "Use recent uploads",
        prompt: "@Uploads What should I do with my recent files?",
        response:
          "I can use the latest photos as context for a refreshed homepage section and queue the update for review.",
      },
    ],
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
    aiCanUseThisTo: [
      "avoid repeating recent changes",
      "explain what the AI updated in weekly reports",
      "suggest the next stale section to refresh",
    ],
    exampleInsight:
      "Your services copy was updated recently, but the homepage still uses older language. Want me to align it?",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Site History What changed recently and what should be updated next?",
    builtIn: true,
    usesSignalInAi: true,
    usageExamples: [
      {
        title: "Find stale content",
        prompt: "@Site History What should be updated next?",
        response:
          "The services page changed recently, but the homepage still uses older positioning. I can queue a homepage copy update.",
      },
    ],
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
    aiCanUseThisTo: [
      "draft page-section updates",
      "queue copy changes for review",
      "keep the site aligned with current offers and signals",
    ],
    exampleInsight:
      "Your reviews mention fast delivery. Want me to queue homepage proof copy that reflects that?",
    actionPaths: ["Draft site update", "Queue change for approval", "Preview changed section"],
    appearsIn: ["Chat", "Suggestions", "Site updates"],
    sourcePrompt: "@Website What is the highest-impact site update to queue?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
    usageExamples: [
      {
        title: "Queue a site update",
        prompt: "@Website What should I update next?",
        response:
          "I can queue a homepage CTA update based on this week's booking-click pattern for approval.",
      },
    ],
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
    aiCanUseThisTo: [
      "draft captions from current site copy",
      "turn offers into reviewable social posts",
      "keep social messaging aligned with the website",
    ],
    exampleInsight:
      "Your new seasonal section can become a short post. Want me to draft it for review?",
    actionPaths: ["Draft social post", "Queue post for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Social Draft a post from the latest site update.",
    builtIn: true,
    canActWhenConnected: true,
    usageExamples: [
      {
        title: "Draft a social post",
        prompt: "@Social Draft a post from the latest site update.",
        response:
          "I drafted a caption from the latest site copy and can queue it for review.",
      },
    ],
  },
  {
    id: "booking-cta",
    displayName: "Booking CTA",
    providerId: "booking-cta",
    shortDescription: "The site action path for booking intent",
    description:
      "Booking CTA is the approval-gated place the AI can improve booking language and links on the website. It does not manage calendar availability; it helps the site send visitors to the right next step.",
    icon: "CTA",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "On approved changes",
    usedIn: "Site updates, chat, reports",
    intelligenceCategory: "can_take_action",
    addsIntelligence: "Where the site asks visitors to book, call, or take the next step.",
    aiCanUseThisTo: [
      "draft clearer booking button copy",
      "align CTA language with the current offer",
      "queue booking-section updates for approval",
    ],
    exampleInsight:
      "Your site says Contact Us, but visitors are trying to book. Want me to queue a clearer Book a Consultation CTA?",
    actionPaths: ["Draft booking CTA update", "Queue site change for review"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Booking CTA Is my booking path clear enough?",
    builtIn: true,
    usesSignalInAi: true,
    canActWhenConnected: true,
    usageExamples: [
      {
        title: "Improve booking CTA",
        prompt: "@Booking CTA Is my booking path clear enough?",
        response:
          "The next step could be clearer. I can queue a booking CTA update for approval.",
      },
    ],
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
    aiCanUseThisTo: [
      "draft a newsletter from recent site changes",
      "adapt website updates into customer-facing email copy",
      "summarize subscriber list status when configured",
    ],
    exampleInsight:
      "You updated the seasonal offer on the site. Want me to draft a short subscriber email that points people to book?",
    actionPaths: ["Draft newsletter for approval", "Queue subscriber update for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Newsletter Draft an update based on the latest site changes.",
    canActWhenConnected: true,
    settingsKey: "newsletter",
    usageExamples: [
      {
        title: "Send an update",
        prompt: "Send an update to subscribers about what changed this week",
        response:
          "I've drafted a newsletter about this week's update. It highlights what changed, why customers should care, and includes your primary call-to-action. Want me to send it?",
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
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What people search before finding you.",
    aiCanUseThisTo: [
      "suggest better page titles around real searches",
      "write service copy around demand that already exists",
      "explain which offers are getting search impressions",
    ],
    exampleInsight:
      "People are searching 'sports massage near me' but your site does not mention it clearly. Want me to add that?",
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Search Console What are people searching for that my site should mention?",
    usesSignalInAi: true,
    settingsKey: "googleSearchConsole",
    configField: "googleSearchConsoleKey",
    usageExamples: [
      {
        title: "What are people searching to find me?",
        prompt: "What search terms bring people to my site?",
        response:
          "Your top searches this week: 'local business near me' (23 clicks), 'services near me' (15 clicks), 'best provider nearby' (8 clicks). Your main offer page ranks #3 for the highest-intent search.",
      },
      {
        title: "How can I rank higher?",
        prompt: "How can I improve my Google ranking?",
        response:
          "You're showing up for a high-intent search but not getting clicks - your title might be too generic. Want me to test a title that leads with your strongest customer outcome?",
      },
    ],
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
    aiCanUseThisTo: [
      "spot review language worth adding to the website",
      "draft review replies for approval",
      "suggest listing or site copy updates when details disagree",
    ],
    exampleInsight:
      "A new review praises same-day pickup. Want me to suggest homepage copy that makes that clearer?",
    actionPaths: ["Draft review reply", "Suggest listing updates", "Queue site copy changes"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Google Business Any review or listing updates I should act on?",
    connectionProvider: "google",
    usageExamples: [
      {
        title: "Respond to my latest review",
        prompt: "Respond to my latest Google review",
        response:
          "You got a 5-star review from Sarah M. I've drafted a reply thanking her, reinforcing what customers value most, and keeping the tone personal. Want me to post it?",
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
    aiCanUseThisTo: [
      "draft social captions from recent site updates",
      "suggest content themes based on current offers",
      "keep website and social messaging consistent",
    ],
    exampleInsight:
      "Your site now highlights gift boxes. Want me to draft an Instagram caption and queue it for review?",
    actionPaths: ["Draft social post", "Queue scheduled post for review"],
    appearsIn: ["Chat", "Suggestions"],
    sourcePrompt: "@Instagram What should we turn into a social post this week?",
    connectionProvider: "instagram",
    settingsKey: "instagram",
    usageExamples: [
      {
        title: "Post about this week's update",
        prompt: "Create an Instagram post about what changed this week",
        response:
          "I've created a post with your selected photo, a caption that explains the update clearly, and relevant local hashtags. Scheduled for Thursday at 10am when your followers are most active.",
      },
      {
        title: "What should I post this week?",
        prompt: "Suggest Instagram content for this week",
        response:
          "Based on your current site: Monday - behind-the-scenes proof. Wednesday - customer story. Friday - timely reminder with your primary call-to-action.",
      },
    ],
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
    aiCanUseThisTo: [
      "review whether booking CTAs match the current offer",
      "suggest booking-page copy and button changes",
      "explain booking-click trends alongside site activity",
    ],
    exampleInsight:
      "Visitors are clicking Book Now, but the button label does not match your consultation offer. Want me to suggest a clearer CTA?",
    actionPaths: ["Suggest booking CTA update", "Queue website booking-link copy changes"],
    appearsIn: ["Chat", "Reports", "Suggestions", "Site updates"],
    sourcePrompt: "@Booking CTA Is my booking path clear enough?",
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
    intelligenceCategory: "understands_customers",
    additionalIntelligenceCategories: ["can_take_action"],
    addsIntelligence: "Customer language and reputation signals from Yelp reviews.",
    aiCanUseThisTo: [
      "draft review replies for approval",
      "surface repeated objections or praise",
      "suggest testimonial or trust copy for the site",
    ],
    exampleInsight:
      "Yelp reviewers keep mentioning fast service. Want me to add that as proof near the booking CTA?",
    actionPaths: ["Draft Yelp review reply", "Suggest site proof copy"],
    appearsIn: ["Chat", "Reports", "Suggestions"],
    sourcePrompt: "@Yelp What customer language should my site reuse?",
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
    shortDescription: "Booking demand context from Vegaro",
    description:
      "Vegaro can become a booking-demand source for the AI. Setup is not live yet, so it should be treated as a planned signal rather than an active scheduling or reminder channel.",
    icon: "VG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
    syncFrequency: "Real-time webhooks",
    usedIn: "Booking notifications, calendar sync",
    intelligenceCategory: "understands_demand",
    addsIntelligence: "What gets booked and when demand changes.",
    aiCanUseThisTo: [
      "suggest which services to promote when bookings rise",
      "explain booking trends in reports",
      "suggest clearer booking CTAs around high-demand services",
    ],
    exampleInsight:
      "If sports massage bookings rise two weeks in a row, I can suggest promoting that service on the homepage.",
    appearsIn: ["Suggestions"],
    sourcePrompt: "@Vegaro What booking trends should I act on?",
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

export function deriveIntelligenceStatus(
  definition: IntegrationDefinition,
  status: IntegrationStatus
): IntelligenceStatus {
  if (status === "needs_reauth" || status === "sync_failed") {
    return "needs_attention";
  }

  if (definition.availability === "coming_soon" || status === "coming_soon") {
    return "no_signal";
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
      integration.exampleInsight,
      ...integration.aiCanUseThisTo,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery)
  );
}
