export interface HeroContent {
  headline: string;
  subheadline: string;
  tagline: string;
  ctaText: string;
  ctaLink: string;
  backgroundImageUrl: string;
  logoUrl?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  duration: string;
  price: string;
  featured: boolean;
  who_its_for: string;
  booking_link: string;
  comingSoon: boolean;
  image_url: string;
}

export interface ServicesContent {
  sectionLabel: string;
  headline: string;
  description: string;
  services: ServiceItem[];
}

export interface StoryContent {
  sectionLabel: string;
  headline: string;
  accentText: string;
  statement: string;
  paragraphs: string[];
  stats: Array<{ value: string; label: string }>;
  quote: string;
  quoteAttribution: string;
  imageUrl: string;
  secondaryImageUrl?: string;
}

export interface TestimonialItem {
  id: string;
  quote: string;
  author: string;
  location: string;
}

export interface TestimonialsContent {
  sectionLabel: string;
  headline: string;
  testimonials: TestimonialItem[];
}

export interface EventItem {
  id: string;
  title: string;
  date: string; // ISO date
  time: string;
  location: string;
  description: string;
  hosted_by: string;
  external_link: string;
  image_url: string;
}

export interface EventsContent {
  sectionLabel: string;
  headline: string;
  events: EventItem[];
}

export interface ProviderItem {
  id: string;
  name: string;
  category: string;
  service: string;
  why_i_recommend: string;
  booking_link: string;
  phone: string;
  photo_url: string;
}

export interface ProvidersContent {
  sectionLabel: string;
  headline: string;
  description: string;
  providers: ProviderItem[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqContent {
  sectionLabel: string;
  headline: string;
  description: string;
  faqs: FaqItem[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  external_link: string;
  image_url: string;
}

export interface ShopContent {
  sectionLabel: string;
  headline: string;
  description: string;
  items: ShopItem[];
}

export interface ContactContent {
  email: string;
  phone?: string;
  address?: string;
  hours?: string;
  locationTitle: string;
  locationDescription: string;
  instagramUrl: string;
  facebookUrl: string;
  googleMapsUrl?: string;
}

export interface SiteSettings {
  siteName: string;
  siteTagline: string;
  siteDescription: string;
  siteKeywords?: string;
  ownerName?: string;
  ownerTitle?: string;
  footerTagline: string;
  copyrightText: string;
  bookingUrl?: string;
  instagramHandle?: string;
  vagaro_embed_id?: string;
  logoUrl?: string;
  marqueeText?: string;
}


export interface ProductItem {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  imageUrl: string;
  badge: string;
  featured: boolean;
  price: string;
  stripePaymentLink: string;
  comingSoon: boolean;
}

export interface ProductsContent {
  sectionLabel: string;
  headline: string;
  description: string;
  products: ProductItem[];
  bottomNote: string;
}

export interface RewardsConfigContent {
  starsPerBag: number;
  starsToRedeem: number;
  redemptionValue: number;
  newsletterBonus: number;
  subscriptionBonus: number;
  tierThresholdSuper: number;
}

export interface NavMenuItem {
  label: string;
  href: string;
}

export interface NavigationContent {
  menuItems: NavMenuItem[];
  ctaLabel: string;
  ctaHref: string;
}

export interface FooterColumnLink {
  label: string;
  href: string;
}

export interface FooterColumn {
  heading: string;
  links: FooterColumnLink[];
}

export interface FooterContent {
  tagline: string;
  columns: FooterColumn[];
  socialLinks: { label: string; href: string }[];
  copyrightText: string;
}

export interface ThemeContent {
  colors: {
    cream: string;
    creamDark: string;
    creamMid: string;
    sage: string;
    sageLight: string;
    sageDark: string;
    bark: string;
    barkLight: string;
    barkFaded: string;
    wheat: string;
    wheatLight: string;
    terra: string;
    terraLight: string;
  };
  fontDisplay: string;
  fontBody: string;
}

export type ContentSection =
  | "hero"
  | "services"
  | "story"
  | "testimonials"
  | "events"
  | "providers"
  | "contact"
  | "settings"
  | "faq"
  | "shop"
  | "products"
  | "theme"
  | "rewardsConfig"
  | "navigation"
  | "footer";

export type ContentMap = {
  hero: HeroContent;
  services: ServicesContent;
  story: StoryContent;
  testimonials: TestimonialsContent;
  events: EventsContent;
  providers: ProvidersContent;
  contact: ContactContent;
  settings: SiteSettings;
  faq: FaqContent;
  shop: ShopContent;
  products: ProductsContent;
  theme: ThemeContent;
  rewardsConfig: RewardsConfigContent;
  navigation: NavigationContent;
  footer: FooterContent;
};

// --- Page Config Types ---

export interface PageSectionConfig {
  type: string;
  visible: boolean;
  order: number;
  props?: Record<string, unknown>;
  variant?: string;
  layout?: {
    gap?: 'tight' | 'normal' | 'loose';
    padding?: 'none' | 'normal' | 'spacious';
  };
  responsive?: {
    mobile?: Partial<Omit<PageSectionConfig, 'responsive'>>;
    tablet?: Partial<Omit<PageSectionConfig, 'responsive'>>;
  };
}

export interface SeoMeta {
  title?: string;
  description?: string;
  ogImage?: string;
}

export interface PageConfig {
  sections: PageSectionConfig[];
  seo?: SeoMeta;
}

export type SitePageConfig = Record<string, PageConfig>;

// --- Site Capability Manifest Types ---

export type DesignTokenScope =
  | "colors"
  | "fonts"
  | "buttons"
  | "spacing"
  | "radius"
  | "motion"
  | "imagery";

export interface SectionCapability {
  variants: string[];
  editableFields: string[];
  styleProps: string[];
  allowedActions?: Array<"read" | "draft" | "publish" | "request_custom">;
}

export interface CustomComponentCapability {
  id: string;
  label: string;
  description?: string;
  adminOnly: boolean;
  exposure?: "inline" | "custom_request";
  supportedProps?: string[];
  requestableChanges?: string[];
}

export interface SiteCapabilityManifest {
  contractVersion: string;
  sections: Record<string, SectionCapability>;
  designTokens: DesignTokenScope[];
  supportsPageConfig: boolean;
  supportsNavigationConfig: boolean;
  supportsFooterConfig: boolean;
  supportsDraftPreview: boolean;
  supportsInlineEditing: boolean;
  customOnlyFeatures: string[];
  customRequestEndpoint?: string;
  customComponents: CustomComponentCapability[];
}

// --- Review Types ---

export interface ReviewItem {
  id: string;
  source: "google" | "yelp" | "manual";
  author: string;
  rating: number;
  text: string;
  date: string;
  reply?: string;
  repliedAt?: string;
}

// --- Booking Types ---

export interface BookingConfig {
  timezone: string;
  weeklySchedule: WeeklySlot[];
  slotDuration: number;
  bufferTime: number;
  bookingLeadTime: number;
  maxAdvanceBooking: number;
  requirePayment: boolean;
}

export interface WeeklySlot {
  day: number;
  start: string;
  end: string;
  enabled: boolean;
}

export interface DateOverride {
  date: string;
  available: boolean;
  start?: string;
  end?: string;
  reason?: string;
}

export interface Booking {
  id: string;
  serviceId: string;
  serviceName: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes?: string;
  status: "confirmed" | "cancelled" | "completed";
  createdAt: string;
  cancelledAt?: string;
}

// --- Search Console Types ---

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface SearchData {
  queries: SearchQuery[];
  totalClicks: number;
  totalImpressions: number;
  fetchedAt: string;
}

// --- Template Types ---

// --- Blog Types ---

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  tags: string[];
}

export type TemplateId = "wellness" | "food-brand" | "restaurant" | "trades" | "professional" | (string & {});

export type TenantFeature = "commerce" | "booking" | "newsletter" | "blog" | "events" | "shop" | "products" | "rewards" | "providers" | "instagram" | "reviews";

export type IntegrationProvider = "google" | "yelp" | "calendly" | "instagram" | "vegaro";

export type TenantDeliveryModel = "custom_repo" | "platform_template";

export type CustomRepoRevalidationHealth =
  | "unknown"
  | "healthy"
  | "failing"
  | "not_configured";

export type CustomRepoDependencyStatus =
  | "healthy"
  | "degraded"
  | "paused"
  | "failing"
  | "unknown";

export type CustomRepoDependencySeverity = "info" | "warning" | "critical";

export interface CustomRepoExternalDependency {
  id: string;
  name: string;
  provider: string;
  purpose: string;
  status: CustomRepoDependencyStatus;
  severity: CustomRepoDependencySeverity;
  detectedAt?: string;
  lastCheckedAt?: string;
  source?: string;
  actionUrl?: string;
  owner?: string;
  notes?: string;
}

export interface CustomRepoMetadata {
  repoName?: string;
  repoUrl?: string;
  localPath?: string;
  productionUrl?: string;
  deploymentProvider?: "vercel" | "other";
  deploymentProjectId?: string;
  lastDeploymentUrl?: string;
  lastDeploymentAt?: string;
  supportedSections?: ContentSection[];
  capabilityManifestUrl?: string;
  supportedDesignTokens?: DesignTokenScope[];
  supportsPageConfig?: boolean;
  supportsDraftPreview?: boolean;
  supportsInlineEditing?: boolean;
  customFeatures?: string[];
  externalDependencies?: CustomRepoExternalDependency[];
  contractVersion?: string;
  revalidationHealth?: CustomRepoRevalidationHealth;
  buildCommand?: string;
  testCommand?: string;
  rollbackPlan?: string;
  notes?: string;
}

export interface Connection {
  provider: IntegrationProvider;
  tenantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  apiKey?: string;
  lastSyncedAt?: string;
  status: "connected" | "disconnected" | "error";
}

// --- Social Media Types ---

export interface SocialPost {
  id: string;
  platform: "instagram" | "facebook" | "x";
  content: string;
  imageUrl?: string;
  status: "draft" | "scheduled" | "published";
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
}

// --- Tenant Types ---

export interface TenantConfig {
  id: string;
  subdomain: string;
  siteName: string;
  ownerName: string;
  ownerEmail?: string;
  industry: string;
  active: boolean;
  createdAt: string;
  template: TemplateId;
  /** Custom repos are the default delivery model for paid clients. */
  deliveryModel?: TenantDeliveryModel;
  customRepo?: CustomRepoMetadata;
  siteCapabilities?: Partial<SiteCapabilityManifest>;
  features?: TenantFeature[];
  integrations?: IntegrationProvider[];
  customDomains?: string[];
  domainClaims?: DomainClaim[];
  /** Primary production domain (e.g., "yourbusiness.com") */
  productionDomain?: string;
  /** Admin dashboard domain (e.g., "admin.yourbusiness.com"). Derived from productionDomain if not set. */
  adminDomain?: string;
  stripeCustomerId?: string;
  subscriptionStatus?: "active" | "trialing" | "past_due" | "cancelled" | "none";
  /** Special billing presentation/access override for early customers or internal accounts. */
  planOverride?: "founder_comp";
  /** When subscriptionStatus changed to past_due (ISO date). Used for grace period calculation. */
  subscriptionPastDueSince?: string;
  bookingProvider?: string;
  bookingUrl?: string;
  resendDomain?: string;
  siteUrl?: string;
  ownerPhone?: string;
  referredBy?: string;
  /** When false, AI agent writes to drafts instead of publishing directly. Defaults to true. */
  autoPublish?: boolean;
  /** Behold.so feed ID — stable identifier, no token refresh needed. Per-tenant. */
  beholdFeedId?: string;
  /** Social media platform configuration (post-launch integration). */
  socialConfig?: { connectedPlatforms?: string[] };
  /** Review platform IDs (post-launch integration). */
  reviewsConfig?: { googlePlaceId?: string; yelpBusinessId?: string };
  /** Free-text persistent instructions the AI follows on every interaction */
  businessRules?: string;
  /** Tone/voice descriptor for AI responses (e.g. "warm and casual", "professional") */
  personality?: string;
  /** Structured business hours the AI uses to answer questions and update the site */
  businessHours?: BusinessHours;
  /** Client's Slack webhook for AI change notifications */
  slackWebhookUrl?: string;
  /** Client's Twilio config for SMS notifications */
  twilioConfig?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  /** Client's Google Search Console service account key (JSON string) */
  googleSearchConsoleKey?: string;
  /** Client's Instagram access token (if not using Behold.so) */
  instagramAccessToken?: string;
  /** URL to POST to when content changes (e.g., https://clientsite.com/api/revalidate) */
  revalidateUrl?: string;
  /** Per-tenant secret for revalidation webhook auth */
  revalidationSecret?: string;
  /** Branding for OG images, favicons, etc. */
  branding?: {
    initials?: string;
    tagline?: string;
    bgColor?: string;
    accentColor?: string;
    fgColor?: string;
  };
}

export type DomainClaimRole = "production" | "admin" | "additional";

export type DomainDnsStatus = "unknown" | "configured" | "misconfigured";

export type DomainSslStatus = "unknown" | "pending" | "issued" | "error";

export type DomainLifecycleStatus =
  | "pending"
  | "verified"
  | "misconfigured"
  | "conflict"
  | "error";

export interface DomainClaim {
  domain: string;
  tenantId: string;
  role: DomainClaimRole;
  status: DomainLifecycleStatus;
  dnsStatus: DomainDnsStatus;
  sslStatus: DomainSslStatus;
  createdAt: string;
  updatedAt: string;
  verification?: string[];
  vercelProjectId?: string;
  error?: string;
}

export interface BusinessHoursDay {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  open: string; // "09:00"
  close: string; // "17:00"
  closed: boolean;
}

export interface BusinessHoliday {
  date: string; // ISO date
  label: string;
}

export interface BusinessHours {
  schedule: BusinessHoursDay[];
  holidays?: BusinessHoliday[];
  timezone?: string;
}

// --- Unified Event Types ---

export interface UnifiedEvent {
  id: string;
  tenantId: string;
  source: 'website' | 'google' | 'yelp' | 'calendly' | 'instagram' | 'vegaro' | 'ai';
  type: 'review' | 'booking' | 'message' | 'mention' | 'content_update' | 'suggestion' | 'newsletter_draft' | 'change_request';
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'dismissed' | 'auto_approved';
  metadata?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export type CustomChangeRequestStatus =
  | "requested"
  | "triaged"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "shipped"
  | "declined";

export type CustomChangeRequestComplexity = "small" | "structural" | "integration" | "unclear";

export interface CustomChangeRequestMetadata {
  kind: "custom_code_or_design_request";
  workflowStatus: CustomChangeRequestStatus;
  requestedAt: string;
  triageDueAt: string;
  deliveryModel: TenantDeliveryModel;
  customRepo?: Pick<
    CustomRepoMetadata,
    "repoName" | "repoUrl" | "localPath" | "productionUrl" | "contractVersion"
  >;
  page?: string;
  section?: string;
  field?: string;
  label?: string;
  nodeType?: string;
  rect?: unknown;
  complexity?: CustomChangeRequestComplexity;
  quoteRequired?: boolean;
  adminOwner?: string;
  shippedAt?: string;
  notes?: string;
}

// --- Site Operation Types ---

export type OperationSource = "user" | "agent" | "integration" | "system";
export type OperationSurface = "site" | "assets" | "sources" | "review" | "newsletter" | "social";
export type OperationStatus = "draft" | "pending_review" | "approved" | "published" | "dismissed" | "blocked";
export type OperationRisk = "low" | "medium" | "high";

export interface SiteOperation {
  id: string;
  tenantId: string;
  source: OperationSource;
  surface: OperationSurface;
  status: OperationStatus;
  title: string;
  description?: string;
  reason?: string;
  risk?: OperationRisk;
  affectedNodes?: string[];
  before?: unknown;
  after?: unknown;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type ContentOperation = SiteOperation & {
  surface: "site";
  nodeType: "content";
  section: string;
  field?: string;
};

export type LayoutOperation = SiteOperation & {
  surface: "site";
  nodeType: "layout";
  changes: Record<string, unknown>;
};

export type AssetOperation = SiteOperation & {
  surface: "assets";
  assetId: string;
  action: "upload" | "replace" | "delete";
};

export type NewsletterOperation = SiteOperation & {
  surface: "newsletter";
  subject: string;
  recipientCount: number;
};

export type SocialOperation = SiteOperation & {
  surface: "social";
  platform: string;
  postContent: string;
};

// --- Weekly Brief Types ---

export interface WeeklyBriefStats {
  pageViews: number;
  bookingClicks: number;
  reviewsReceived: number;
  contentUpdates: number;
  pageViewsDelta: number;
  bookingClicksDelta: number;
}

export interface WeeklyBriefNextAction {
  title: string;
  description: string;
}

export interface WeeklyBriefService {
  name: string;
  clicks: number;
}

export interface WeeklyBriefStaleSection {
  section: string;
  daysSinceUpdate: number;
}

export interface WeeklyBrief {
  id: string;
  tenantId: string;
  weekStart: string;
  weekEnd: string;
  summary: string;
  stats: WeeklyBriefStats;
  highlights: string[];
  nextAction?: WeeklyBriefNextAction;
  topServices: WeeklyBriefService[];
  topSearchQueries: SearchQuery[];
  staleSections: WeeklyBriefStaleSection[];
  createdAt: string;
}
