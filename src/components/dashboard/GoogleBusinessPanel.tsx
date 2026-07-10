"use client";

import Link from "next/link";
import { Clock, FileText, Star, MapPin, ArrowRight, Check } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import type { GbpState } from "@/lib/gbp-management";

const UNLOCKS = [
  { icon: Clock, title: "Hours that stay right", desc: "Change them once — your site and your Google listing match." },
  { icon: FileText, title: "Posts to Google", desc: "Turn updates and offers into Google Posts, approved by you first." },
  { icon: Star, title: "Reviews in one place", desc: "See new reviews and approve AI-drafted replies without leaving here." },
  { icon: MapPin, title: "Found on Maps", desc: "Keep your listing complete so nearby customers actually find you." },
];

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

function fmtTime(t?: { hours: number; minutes: number }): string {
  if (!t) return "";
  const h = t.hours % 12 || 12;
  const ampm = t.hours < 12 ? "am" : "pm";
  return t.minutes ? `${h}:${String(t.minutes).padStart(2, "0")}${ampm}` : `${h}${ampm}`;
}

export function GoogleBusinessPanel({ connected, state }: { connected: boolean; state: GbpState | null }) {
  const { dashboardHref } = useDashboard();

  if (!connected) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
          <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
          Google Business
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight text-warm-black">
          Connect your Google listing
        </h1>
        <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-gray-muted">
          Connecting Google links your Business Profile, Search Console, and Analytics in one step.
          Strelva keeps your listing in sync with your site — hours, posts, and reviews, all approved
          by you — and shows how customers actually find you in your weekly report.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {UNLOCKS.map((u) => {
            const Icon = u.icon;
            return (
              <div key={u.title} className="rounded-xl border border-glass-border bg-surface-raised px-4 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                </span>
                <p className="mt-3 text-[14px] font-medium text-warm-black">{u.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-muted">{u.desc}</p>
              </div>
            );
          })}
        </div>

        <Link
          href={dashboardHref("/dashboard/sources/google-business")}
          prefetch={false}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-on-accent transition-opacity hover:opacity-90"
        >
          Connect Google Business
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </Link>
      </div>
    );
  }

  const hours = state?.regularHours?.periods ?? [];
  const posts = state?.recentPosts ?? [];

  // Lead with a plain-English health verdict, not a data dump. Opportunity-framed
  // when something's missing — never shaming.
  const verdict = hours.length
    ? "Your listing is live on Google and showing up on Maps."
    : "Your listing is connected. Add your hours so customers know when you're open.";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            <MapPin className="h-3.5 w-3.5" strokeWidth={1.7} />
            Google Business
          </div>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-[26px] font-normal leading-tight text-warm-black">
            Your Google listing
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-dim px-2.5 py-1 text-[12px] font-medium text-accent">
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          Connected
        </span>
      </div>

      <p className="mt-4 text-[15px] font-medium leading-snug text-warm-black">
        {verdict}
      </p>
      <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-gray-muted">
        Changes to your listing run through your approval queue before they publish to Google —
        nothing goes live without your sign-off.
      </p>

      {/* Hours */}
      <section className="mt-6 rounded-xl border border-glass-border bg-surface-raised p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-muted" strokeWidth={1.6} />
          <h2 className="text-[14px] font-medium text-warm-black">Hours on Google</h2>
        </div>
        {hours.length ? (
          <ul className="mt-3 space-y-1.5">
            {hours.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-[13px]">
                <span className="text-gray-muted">{DAY_LABEL[p.openDay] ?? p.openDay}</span>
                <span className="text-warm-black">{fmtTime(p.openTime)} – {fmtTime(p.closeTime)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-gray-muted">
            Hours haven&apos;t synced yet. Ask Strelva to set them and approve the change.
          </p>
        )}
      </section>

      {/* Recent posts */}
      <section className="mt-4 rounded-xl border border-glass-border bg-surface-raised p-5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-muted" strokeWidth={1.6} />
          <h2 className="text-[14px] font-medium text-warm-black">Recent Google Posts</h2>
        </div>
        {posts.length ? (
          <ul className="mt-3 space-y-2">
            {posts.map((post) => (
              <li key={post.name} className="rounded-lg border border-gray-border bg-surface-base px-3 py-2.5">
                <p className="text-[13px] leading-relaxed text-warm-black">{post.summary || "(no summary)"}</p>
                {post.createTime && (
                  <p className="mt-1 text-[11px] text-gray-faint">
                    {new Date(post.createTime).toLocaleDateString()}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-gray-muted">
            No posts yet. Ask Strelva to draft one from a recent update — you approve before it publishes.
          </p>
        )}
      </section>
    </div>
  );
}
