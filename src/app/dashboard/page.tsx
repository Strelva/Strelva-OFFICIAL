import {
  MessageCircle,
  Globe,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { getActivity } from "@/lib/storage";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const QUICK_ACTIONS = [
  { label: "Chat with AI", href: "/dashboard/chat", icon: MessageCircle },
  { label: "View my site", href: "/dashboard/site", icon: Globe },
  { label: "Update hours", href: "/dashboard/chat", icon: Clock },
];

export default async function DashboardOverview() {
  const activity = await getActivity();

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Site status bar */}
      <div className="flex items-center gap-1.5 mb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs font-mono text-zinc-400">Live</span>
      </div>

      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {getGreeting()}, Chelsea
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Here&apos;s what&apos;s happening with your site.
        </p>
      </div>

      {/* Hero metrics — honest empty state until analytics are wired */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              PEOPLE WHO FOUND YOU
            </span>
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            &mdash;
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-1">
            Connect analytics to track
          </p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              BOOKING CLICKS
            </span>
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            &mdash;
          </p>
          <p className="text-xs font-mono text-zinc-600 mt-1">
            Connect analytics to track
          </p>
        </div>
      </div>

      {/* Status rows — compact, not cards */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg divide-y divide-[#262626] mb-6">
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              SITE HEALTH
            </span>
          </div>
          <span className="text-sm font-mono text-zinc-200">
            Everything looks good
          </span>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              AI ACTIVITY
            </span>
          </div>
          <span className="text-sm font-mono tabular-nums text-zinc-200">
            {activity.length > 0 ? `${activity.length} updates logged` : "No updates yet"}
          </span>
        </div>
      </div>

      {/* Two-column: Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-[#141414] border border-[#262626] rounded-lg p-5">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
            RECENT ACTIVITY
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">
              No activity yet — updates will appear here when you use the AI chat.
            </p>
          ) : (
            <div className="space-y-0">
              {activity.slice(0, 10).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-3 border-b border-[#1c1c1c] last:border-0 animate-fade-in-up"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      item.type === "ai" ? "bg-violet-500" : "bg-emerald-500"
                    }`}
                  />
                  <p className="text-sm text-zinc-200 flex-1">{item.text}</p>
                  <span className="text-xs font-mono text-zinc-500 shrink-0">
                    {timeAgo(item.time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-4">
            QUICK ACTIONS
          </h2>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-transparent hover:border-l-2 hover:border-l-violet-600 hover:bg-[#1c1c1c] text-sm text-zinc-300 hover:text-white transition-colors duration-150 group"
              >
                <span className="flex items-center gap-2.5">
                  <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors duration-150" />
                  {action.label}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 group-hover:rotate-45 transition-all duration-150" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
