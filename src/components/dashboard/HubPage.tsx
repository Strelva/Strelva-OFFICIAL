"use client";

import { useRef, useEffect } from "react";
import {
  Sparkles, ListChecks, User, MessageSquareQuote,
  Calendar, Users, Mail, Settings as SettingsIcon,
} from "lucide-react";
import gsap from "gsap";
import { ActivityTimeline } from "./ActivityTimeline";
import type { SectionData } from "./ContentBrowser";

const SECTION_ICONS: Record<string, React.ElementType> = {
  hero: Sparkles,
  services: ListChecks,
  story: User,
  testimonials: MessageSquareQuote,
  events: Calendar,
  providers: Users,
  contact: Mail,
  settings: SettingsIcon,
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Banner",
  services: "Services",
  story: "Story",
  testimonials: "Reviews",
  events: "Events",
  providers: "Providers",
  contact: "Contact",
  settings: "Settings",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface HubPageProps {
  ownerName: string;
  pageViews: { total: number; today: number; thisWeek: number };
  bookingClicks: { total: number; today: number; thisWeek: number };
  siteScore: { score: number; items: { label: string; done: boolean }[] };
  suggestions: string[];
  sectionData: Record<string, SectionData>;
}

export function HubPage({
  ownerName,
  pageViews,
  bookingClicks,
  siteScore,
  suggestions,
  sectionData,
}: HubPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Accent line draws in
      const accent = el.querySelector('[data-ov="accent"]');
      if (accent) {
        gsap.set(accent, { scaleX: 0, transformOrigin: "left" });
        tl.to(accent, { scaleX: 1, duration: 0.6 }, 0);
      }

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

      // Activity card
      const activity = el.querySelector('[data-ov="activity"]');
      if (activity) {
        gsap.set(activity, { opacity: 0, y: 12 });
        tl.to(activity, { opacity: 1, y: 0, duration: 0.4 }, 0.85);
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="p-5 max-w-xl">
      <div data-ov="accent" className="h-[2px] bg-gradient-to-r from-[#7c9a8e] via-[#96b3a6] to-transparent mb-5 rounded-full" />
      {/* Headline */}
      <div data-ov="headline" className="mb-5">
        <h1 className="text-[20px] font-medium tracking-tight text-[#1a1a1a]" suppressHydrationWarning>
          {pageViews.thisWeek > 0
            ? `${pageViews.thisWeek} people found you this week`
            : `${getGreeting()}, ${ownerName}`}
        </h1>
        <p className="text-[12px] text-[#999] mt-1">
          {pageViews.thisWeek > 0
            ? `${bookingClicks.thisWeek} clicked Book Now`
            : "Your site is ready \u2014 here\u2019s how it\u2019s doing."}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">PEOPLE WHO FOUND YOU</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {pageViews.total > 0 ? pageViews.total : "\u2014"}
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {pageViews.total > 0 ? `${pageViews.thisWeek} this week` : "Share your link to start tracking"}
          </p>
        </div>
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">BOOKING CLICKS</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {bookingClicks.total > 0 ? bookingClicks.total : "\u2014"}
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {bookingClicks.total > 0 ? `${bookingClicks.thisWeek} this week` : "Clicks tracked automatically"}
          </p>
        </div>
        <div data-ov="metric" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow cursor-pointer">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">SITE COMPLETENESS</span>
          <p className="text-[28px] font-semibold font-mono tabular-nums text-[#1a1a1a] mt-2">
            {siteScore.score}%
          </p>
          <p className="text-[10px] font-mono text-[#bbb] mt-0.5">
            {siteScore.items.filter(i => i.done).length} of {siteScore.items.length} sections
          </p>
          <div className="mt-2 h-[3px] bg-[#f5f5f5] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${siteScore.score}%`,
                background: siteScore.score === 100 ? "#10b981" : "#7c9a8e",
              }}
            />
          </div>
        </div>
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div data-ov="suggestions" className="bg-[#7c9a8e]/[0.06] border border-[#7c9a8e]/[0.12] rounded-lg px-4 py-3 mb-5">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-[#7c9a8e] mb-2">SUGGESTIONS</h2>
          <div className="space-y-1.5">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[12px] text-[#1a1a1a]">
                <div className="w-1 h-1 rounded-full bg-[#7c9a8e] shrink-0" />
                <span className="flex-1">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Site sections visual map */}
      <div data-ov="sitemap" className="bg-white border border-[#e8e8e8] rounded-lg p-4 mb-5 reb-card-glow cursor-pointer">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-[#999] mb-3">YOUR SITE</h3>
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(sectionData).map(([key, data]) => (
            <div
              key={key}
              data-ov="icon"
              className="flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg bg-[#faf9f7] border border-transparent hover:border-[#7c9a8e]/20 transition-colors"
            >
              {(() => {
                const Icon = SECTION_ICONS[key];
                const isActive = data.status === "live" || data.status === "configured";
                return Icon ? (
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#7c9a8e]" : "text-[#ccc]"}`} strokeWidth={1.5} />
                ) : (
                  <div className={`w-2 h-2 rounded-full ${isActive ? "bg-[#7c9a8e]" : "bg-[#e8e8e8]"}`} />
                );
              })()}
              <span className="text-[9px] font-medium text-[#999] text-center leading-tight">
                {SECTION_LABELS[key] || key}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity timeline (client component with filtering) */}
      <div data-ov="activity" className="bg-white border border-[#e8e8e8] rounded-lg p-4 reb-card-glow">
        <ActivityTimeline />
      </div>
    </div>
  );
}
