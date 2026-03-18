import {
  Users,
  MousePointerClick,
  CheckCircle2,
  Bot,
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

const METRICS = [
  {
    label: "People who found you",
    value: "127",
    change: "+12%",
    positive: true,
    icon: Users,
  },
  {
    label: "Booking clicks",
    value: "23",
    change: "+8%",
    positive: true,
    icon: MousePointerClick,
  },
  {
    label: "Site health",
    value: "Everything looks good",
    dot: true,
    icon: CheckCircle2,
  },
  {
    label: "AI activity",
    value: "3 updates this week",
    icon: Bot,
  },
];

const ACTIVITY = [
  {
    text: "Updated Sunday hours to Closed",
    time: "2 hours ago",
  },
  {
    text: "Added new testimonial from Sarah M.",
    time: "Yesterday",
  },
  {
    text: "Published blog post: Spring Stretching Tips",
    time: "3 days ago",
  },
];

const QUICK_ACTIONS = [
  { label: "Chat with AI", href: "/dashboard/chat", icon: MessageCircle },
  { label: "View my site", href: "/dashboard/site", icon: Globe },
  { label: "Update hours", href: "/dashboard/chat", icon: Clock },
];

export default function DashboardOverview() {
  return (
    <div className="p-6 md:p-10 max-w-5xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">
          {getGreeting()}, Chelsea
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Here&apos;s what&apos;s happening with your site.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {METRICS.map((metric) => (
          <div
            key={metric.label}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <metric.icon className="w-4.5 h-4.5 text-zinc-500" />
              {metric.change && (
                <span
                  className={`text-xs font-medium ${
                    metric.positive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {metric.change}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {metric.dot && (
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
              <p className="text-lg font-semibold text-white">{metric.value}</p>
            </div>
            <p className="text-xs text-zinc-500 mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column: Activity + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            Recent AI Activity
          </h2>
          <div className="space-y-4">
            {ACTIVITY.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 pb-4 border-b border-zinc-800 last:border-0 last:pb-0"
              >
                <div className="w-7 h-7 rounded-full bg-violet-600/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{item.text}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-sm text-zinc-300 hover:text-white transition-colors group"
              >
                <span className="flex items-center gap-2.5">
                  <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-violet-400 transition-colors" />
                  {action.label}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
