"use client";

import { useRouter } from "next/navigation";
import { Search, ChevronRight, CircleCheck } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

export interface Connection {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  connected: boolean;
}

type ConnectionId = "google-analytics" | "newsletter" | "google-business" | "instagram" | "calendly" | "yelp";

interface ConnectionStates {
  googleAnalytics: boolean;
  newsletter: boolean;
  googleBusiness: boolean;
  instagram: boolean;
  calendly: boolean;
  yelp: boolean;
}

const CONNECTION_KEY_MAP: Record<ConnectionId, keyof ConnectionStates> = {
  "google-analytics": "googleAnalytics",
  "newsletter": "newsletter",
  "google-business": "googleBusiness",
  "instagram": "instagram",
  "calendly": "calendly",
  "yelp": "yelp",
};

const CONNECTION_TEMPLATES: Omit<Connection, "connected">[] = [
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Traffic data for reports & AI suggestions",
    icon: "GA",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "AI drafts & sends email to subscribers",
    icon: "NL",
    iconBg: "bg-[rgba(129,140,248,0.09)]",
    iconColor: "text-[#818cf8]",
  },
  {
    id: "google-business",
    name: "Google Business",
    description: "Sync reviews & keep your listing current",
    icon: "GB",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Auto-post from your site's content",
    icon: "IG",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
  },
  {
    id: "calendly",
    name: "Calendly",
    description: "Sync availability & track appointments",
    icon: "CL",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
  },
  {
    id: "yelp",
    name: "Yelp",
    description: "Monitor & respond to Yelp reviews",
    icon: "YP",
    iconBg: "bg-[rgba(255,255,255,0.03)]",
    iconColor: "text-gray-fg",
  },
];

function ConnectionBadge() {
  return (
    <span className="flex items-center gap-1 rounded-[10px] bg-success-dim px-2.5 py-1 text-[11px] font-medium text-success">
      <CircleCheck className="w-3 h-3" strokeWidth={2} />
      Connected
    </span>
  );
}

function ConnectionRow({ connection, onClick }: { connection: Connection; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 w-full rounded-xl p-3.5 hover:bg-gray-bg transition-colors text-left"
    >
      <div className={`w-[42px] h-[42px] rounded-xl ${connection.iconBg} flex items-center justify-center shrink-0`}>
        <span className={`text-[14px] font-bold ${connection.iconColor}`}>{connection.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-warm-black block">{connection.name}</span>
        <span className="text-[12px] text-gray-muted block mt-0.5">{connection.description}</span>
      </div>
      {connection.connected && <ConnectionBadge />}
      <ChevronRight className="w-3.5 h-3.5 text-gray-faint shrink-0" strokeWidth={1.5} />
    </button>
  );
}

type FilterTab = "All" | "Connected" | "Available";

export function ConnectionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [connectionStates, setConnectionStates] = useState<ConnectionStates>({
    googleAnalytics: false,
    newsletter: false,
    googleBusiness: false,
    instagram: false,
    calendly: false,
    yelp: false,
  });

  useEffect(() => {
    // Fetch from both tenant-settings (legacy) and connections API
    Promise.all([
      fetch("/api/tenant-settings", { credentials: "same-origin" }).then((r) => r.json()),
      fetch("/api/connections", { credentials: "same-origin" }).then((r) => r.json()),
    ])
      .then(([settingsData, connectionsData]) => {
        const states: ConnectionStates = {
          googleAnalytics: settingsData.connections?.googleAnalytics || false,
          newsletter: settingsData.connections?.newsletter || false,
          googleBusiness: false,
          instagram: settingsData.connections?.instagram || false,
          calendly: settingsData.connections?.calendly || false,
          yelp: false,
        };

        // Override with actual connection status from Redis
        if (connectionsData.connections) {
          for (const conn of connectionsData.connections) {
            if (conn.provider === "google") states.googleBusiness = conn.connected;
            if (conn.provider === "yelp") states.yelp = conn.connected;
          }
        }

        setConnectionStates(states);
      })
      .catch(() => {
        // Keep defaults (all false) on error
      });
  }, []);

  const allConnections: Connection[] = useMemo(
    () =>
      CONNECTION_TEMPLATES.map((t) => ({
        ...t,
        connected: connectionStates[CONNECTION_KEY_MAP[t.id as ConnectionId]] ?? false,
      })),
    [connectionStates]
  );

  const connections = useMemo(() => {
    if (activeTab === "Connected") return allConnections.filter((c) => c.connected);
    if (activeTab === "Available") return allConnections.filter((c) => !c.connected);
    return allConnections;
  }, [allConnections, activeTab]);

  const featured = allConnections[0]; // Google Analytics as featured

  return (
    <div className="flex-1 overflow-y-auto p-8 lg:px-12 lg:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[22px] font-semibold text-warm-black tracking-[-0.01em]">Connections</h1>
          <span className="text-[13px] text-gray-muted">{connections.filter((c) => c.connected).length} active</span>
        </div>
        <div className="flex items-center gap-2 bg-surface-inset border border-gray-border rounded-xl px-3.5 py-2">
          <Search className="w-4 h-4 text-gray-subtle" strokeWidth={1.5} />
          <input
            placeholder="Search connections..."
            className="bg-transparent text-[13px] text-warm-black placeholder-gray-subtle outline-none w-[180px]"
          />
        </div>
      </div>
      <p className="text-[14px] text-gray-muted leading-relaxed max-w-[600px] mb-8">
        Connect your tools to make your AI smarter. It pulls real data into your reports, drafts, and suggestions.
      </p>

      {/* Featured hero card */}
      <div
        onClick={() => router.push(`/dashboard/connections/${featured.id}`)}
        className="flex rounded-3xl bg-surface-raised border border-gray-border overflow-hidden mb-8 cursor-pointer hover:border-gray-subtle transition-colors shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
      >
        <div className="flex-1 flex flex-col justify-center gap-4 p-10">
          <div className="w-12 h-12 rounded-[14px] bg-glass border border-gray-border flex items-center justify-center">
            <span className="text-[16px] font-bold text-accent">{featured.icon}</span>
          </div>
          <h2 className="text-[22px] font-semibold text-white">{featured.name}</h2>
          <p className="text-[13px] text-[#ffffffaa] leading-relaxed max-w-[340px]">
            Your AI reads your traffic data and turns it into plain-English weekly reports. No dashboards to learn.
          </p>
          <button className="self-start rounded-xl bg-[rgba(255,255,255,0.09)] border border-[rgba(255,255,255,0.13)] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[rgba(255,255,255,0.14)] transition-colors">
            View
          </button>
        </div>
        <div className="w-[380px] flex items-center justify-center p-6">
          <div className="w-full rounded-2xl bg-glass border border-gray-border overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-gray-border">
              <span className="text-[11px] font-medium text-accent">@Analytics</span>
              <span className="text-[11px] text-[#ffffffcc]">how did my site do this week?</span>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[12px] text-[#ffffffcc] leading-relaxed">
                Your site had 47 visitors this week, up 12% from last week. Your Services page got the most views (28). 3 people clicked Book Now — all on Tuesday after you posted about the new class.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-glass-border mb-4 pb-0">
        {(["All", "Connected", "Available"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-[13px] transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "text-warm-black border-accent font-medium"
                : "text-gray-muted border-transparent hover:text-warm-black"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Grid — two columns */}
      <div className="space-y-1">
        {Array.from({ length: Math.ceil(connections.length / 2) }, (_, rowIdx) => (
          <div key={rowIdx} className="flex gap-1">
            {connections.slice(rowIdx * 2, rowIdx * 2 + 2).map((connection) => (
              <div key={connection.id} className="flex-1">
                <ConnectionRow
                  connection={connection}
                  onClick={() => router.push(`/dashboard/connections/${connection.id}`)}
                />
              </div>
            ))}
            {connections.slice(rowIdx * 2, rowIdx * 2 + 2).length === 1 && <div className="flex-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}
