import {
  Users,
  MousePointerClick,
  MessageCircle,
  Globe,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const ACTIVITY = [
  {
    text: "Updated Sunday hours to Closed",
    time: "2h ago",
    type: "update" as const,
  },
  {
    text: "Added new testimonial from Sarah M.",
    time: "1d ago",
    type: "update" as const,
  },
  {
    text: "AI optimized meta descriptions",
    time: "2d ago",
    type: "ai" as const,
  },
  {
    text: "Published blog post: Spring Stretching Tips",
    time: "3d ago",
    type: "ai" as const,
  },
];

const QUICK_ACTIONS = [
  { label: "Chat with AI", href: "/dashboard/chat", icon: MessageCircle },
  { label: "View my site", href: "/dashboard/site", icon: Globe },
  { label: "Update hours", href: "/dashboard/chat", icon: Clock },
];

export default function DashboardOverview() {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Site status bar */}
      <div className="flex items-center gap-1.5 mb-6">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="text-xs font-mono text-zinc-400">Live</span>
        <span className="text-xs text-zinc-600 mx-1">&middot;</span>
        <span className="text-xs font-mono text-zinc-500">
          Updated 2h ago
        </span>
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

      {/* Hero metrics — visitors + clicks (the important numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              PEOPLE WHO FOUND YOU
            </span>
            <span className="text-xs font-mono text-emerald-400">+12%</span>
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            127
          </p>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-5 hover:border-[#333] hover:-translate-y-px transition-all duration-150">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              BOOKING CLICKS
            </span>
            <span className="text-xs font-mono text-emerald-400">+8%</span>
          </div>
          <p className="text-3xl font-semibold font-mono tabular-nums text-white transition-all duration-700">
            23
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
            3 updates this week
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
          <div className="space-y-0">
            {ACTIVITY.map((item, i) => (
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
                  {item.time}
                </span>
              </div>
            ))}
          </div>
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
