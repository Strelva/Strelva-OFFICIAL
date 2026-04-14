"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ActivityTimeline } from "./ActivityTimeline";
import { WelcomeBanner } from "./WelcomeBanner";
import { ExistingClientWelcome } from "./ExistingClientWelcome";
import { SuggestionCards } from "./SuggestionCards";
import { useDashboard } from "./DashboardContext";
import { SECTION_LABELS, SECTION_ICONS } from "@/components/ui/section-labels";
import type { SectionData } from "./ContentBrowser";
import { Card } from "@/components/ui/Card";
import { Mail, Star, Share2, Gift, ChevronRight } from "lucide-react";

const CTA_VOCAB: Record<string, { metric: string; action: string; zeroHint: string }> = {
  wellness: { metric: "Booking clicks", action: "clicked Book Now", zeroHint: "Clicks tracked automatically" },
  "food-brand": { metric: "Shop clicks", action: "clicked Shop Now", zeroHint: "Clicks tracked automatically" },
  restaurant: { metric: "Reservation clicks", action: "clicked Reserve", zeroHint: "Clicks tracked automatically" },
  trades: { metric: "Quote requests", action: "requested a quote", zeroHint: "Clicks tracked automatically" },
  professional: { metric: "Contact clicks", action: "clicked Contact", zeroHint: "Clicks tracked automatically" },
};

function getVocab(template: string) {
  return CTA_VOCAB[template] || CTA_VOCAB.wellness;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface HubPageProps {
  ownerName: string;
  siteName: string;
  pageViews: { total: number; today: number; thisWeek: number };
  bookingClicks: { total: number; today: number; thisWeek: number };
  siteScore: { score: number; items: { label: string; done: boolean }[] };
  suggestions: string[];
  sectionData: Record<string, SectionData>;
  isInvited?: boolean;
  recentActivity?: Array<{ text: string; time: string }>;
}

export function HubPage({
  ownerName,
  siteName,
  pageViews,
  bookingClicks,
  siteScore,
  suggestions,
  sectionData,
  isInvited,
  recentActivity,
}: HubPageProps) {
  const { setChatDrawerOpen, siteUrl, template } = useDashboard();
  const vocab = getVocab(template);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Headline fades up
      const headline = el.querySelector('[data-ov="headline"]');
      if (headline) {
        gsap.set(headline, { opacity: 0, y: 16 });
        tl.to(headline, { opacity: 1, y: 0, duration: 0.5 }, 0.1);
      }

      // Metric cards stagger in with scale
      const metrics = el.querySelectorAll('[data-ov="metric"]');
      if (metrics.length) {
        gsap.set(metrics, { opacity: 0, y: 16, scale: 0.97 });
        tl.to(metrics, { opacity: 1, y: 0, scale: 1, duration: 0.4, stagger: 0.08 }, 0.25);
      }

      // Suggestions card
      const suggestionsEl = el.querySelector('[data-ov="suggestions"]');
      if (suggestionsEl) {
        gsap.set(suggestionsEl, { opacity: 0, y: 12 });
        tl.to(suggestionsEl, { opacity: 1, y: 0, duration: 0.4 }, 0.5);
      }

      // Site map card
      const sitemap = el.querySelector('[data-ov="sitemap"]');
      if (sitemap) {
        gsap.set(sitemap, { opacity: 0, y: 12 });
        tl.to(sitemap, { opacity: 1, y: 0, duration: 0.4 }, 0.6);
      }

      // Site map icons pop in
      const icons = el.querySelectorAll('[data-ov="icon"]');
      if (icons.length) {
        gsap.set(icons, { opacity: 0, scale: 0.8 });
        tl.to(icons, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.04 }, 0.7);
      }

      // Capability cards
      const capabilities = el.querySelector('[data-ov="capabilities"]');
      if (capabilities) {
        gsap.set(capabilities, { opacity: 0, y: 12 });
        tl.to(capabilities, { opacity: 1, y: 0, duration: 0.4 }, 0.7);
      }

      // Activity card
      const activity = el.querySelector('[data-ov="activity"]');
      if (activity) {
        gsap.set(activity, { opacity: 0, y: 12 });
        tl.to(activity, { opacity: 1, y: 0, duration: 0.4 }, 0.9);
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="p-6 md:p-10 lg:p-16 w-full max-w-5xl mx-auto h-full overflow-y-auto">
      {isInvited ? (
        <ExistingClientWelcome
          ownerName={ownerName}
          siteUrl={siteUrl}
          activity={recentActivity || []}
          onOpenChat={() => setChatDrawerOpen(true)}
        />
      ) : (
        <WelcomeBanner siteName={siteName} />
      )}
      {/* Headline */}
      <div data-ov="headline" className="mb-8">
        <h1 className="text-[32px] md:text-[40px] font-normal tracking-[-0.03em] leading-[1.1] text-warm-black" suppressHydrationWarning>
          {pageViews.thisWeek > 0
            ? `${pageViews.thisWeek} people found you this week`
            : `${getGreeting()}, ${ownerName}`}
        </h1>
        <p className="text-[14px] font-light tracking-[-0.01em] text-gray-muted mt-3">
          {pageViews.thisWeek > 0
            ? `${bookingClicks.thisWeek} ${vocab.action}`
            : "Your site is live. Here\u2019s what\u2019s happening."}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Card variant="interactive" data-ov="metric" padding="lg" className="h-full">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">People who found you</span>
          <p className="text-[40px] font-light tracking-[-0.03em] tabular-nums text-warm-black mt-3 leading-none">
            {pageViews.total > 0 ? pageViews.total : "\u2014"}
          </p>
          <p className="text-[12px] text-gray-faint mt-2 tracking-[-0.01em]">
            {pageViews.total > 0 ? `${pageViews.thisWeek} this week` : "Share your link to start tracking"}
          </p>
        </Card>
        <Card variant="interactive" data-ov="metric" padding="lg" className="h-full">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">{vocab.metric}</span>
          <p className="text-[40px] font-light tracking-[-0.03em] tabular-nums text-warm-black mt-3 leading-none">
            {bookingClicks.total > 0 ? bookingClicks.total : "\u2014"}
          </p>
          <p className="text-[12px] text-gray-faint mt-2 tracking-[-0.01em]">
            {bookingClicks.total > 0 ? `${bookingClicks.thisWeek} this week` : vocab.zeroHint}
          </p>
        </Card>
        <Card variant="interactive" data-ov="metric" padding="lg" className="h-full">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">Site readiness</span>
          <p className="text-[40px] font-light tracking-[-0.03em] tabular-nums text-warm-black mt-3 leading-none">
            {siteScore.score}%
          </p>
          <p className="text-[12px] text-gray-faint mt-2 tracking-[-0.01em]">
            {siteScore.items.filter(i => i.done).length} of {siteScore.items.length} sections
          </p>
          <div className="mt-3 h-[2px] bg-gray-bg rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${siteScore.score}%`,
                background: siteScore.score === 100 ? "#10b981" : "#ffffff",
              }}
            />
          </div>
        </Card>
      </div>

      {/* AI-powered actionable suggestions */}
      <SuggestionCards />

      {/* Static fallback suggestions */}
      {suggestions.length === 1 && (
        <div data-ov="suggestions" className="flex items-center gap-2.5 text-[12px] tracking-[-0.01em] text-gray-fg bg-gray-bg rounded-xl px-4 py-3 mb-8">
          <div className="w-1 h-1 rounded-full bg-white shrink-0" />
          <span className="flex-1">{suggestions[0]}</span>
        </div>
      )}
      {suggestions.length > 1 && (
        <Card padding="none" className="bg-gray-bg border-gray-border rounded-xl px-5 py-4 mb-8">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted mb-3">Tips</h2>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[12px] tracking-[-0.01em] text-gray-fg">
                <div className="w-1 h-1 rounded-full bg-white shrink-0" />
                <span className="flex-1">{s}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Site sections visual map */}
      <div data-ov="sitemap" className="bg-surface border border-gray-border rounded-xl p-5 mb-10 reb-card-glow">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted mb-4">Your site</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {Object.entries(sectionData).map(([key, data]) => (
            <div
              key={key}
              data-ov="icon"
              className="flex flex-col items-center gap-2 px-3 py-3 rounded-xl bg-surface-raised border border-transparent hover:border-gray-border transition-colors"
            >
              {(() => {
                const Icon = SECTION_ICONS[key];
                const isActive = data.status === "live" || data.status === "configured";
                return Icon ? (
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-gray-subtle"}`} strokeWidth={1.5} />
                ) : (
                  <div className={`w-2 h-2 rounded-full ${isActive ? "bg-white" : "bg-gray-border"}`} />
                );
              })()}
              <span className="text-[11px] font-medium tracking-[-0.01em] text-gray-muted text-center leading-tight">
                {SECTION_LABELS[key] || key}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Capability cards */}
      <div data-ov="capabilities" className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
        <a href="/dashboard/subscribers" className="group bg-surface border border-gray-border rounded-xl p-4 hover:border-gray-faint transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
              <span className="text-[13px] font-medium text-warm-black">Subscribers</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-subtle group-hover:text-gray-muted transition-colors" />
          </div>
          <p className="text-[12px] text-gray-muted">Manage your email list and send newsletters</p>
        </a>
        <a href="/dashboard/reviews" className="group bg-surface border border-gray-border rounded-xl p-4 hover:border-gray-faint transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
              <span className="text-[13px] font-medium text-warm-black">Reviews</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-subtle group-hover:text-gray-muted transition-colors" />
          </div>
          <p className="text-[12px] text-gray-muted">See and respond to customer reviews</p>
        </a>
        <a href="/dashboard/social" className="group bg-surface border border-gray-border rounded-xl p-4 hover:border-gray-faint transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
              <span className="text-[13px] font-medium text-warm-black">Social</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-gray-subtle group-hover:text-gray-muted transition-colors" />
          </div>
          <p className="text-[12px] text-gray-muted">Draft and schedule social media posts</p>
        </a>
        {template === "food-brand" && (
          <a href="/dashboard/rewards" className="group bg-surface border border-gray-border rounded-xl p-4 hover:border-gray-faint transition-colors">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
                <span className="text-[13px] font-medium text-warm-black">Rewards</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-subtle group-hover:text-gray-muted transition-colors" />
            </div>
            <p className="text-[12px] text-gray-muted">Manage your loyalty program</p>
          </a>
        )}
      </div>

      {/* Activity timeline */}
      <div data-ov="activity" className="bg-surface border border-gray-border rounded-xl p-5 reb-card-glow">
        <ActivityTimeline />
      </div>
    </div>
  );
}
