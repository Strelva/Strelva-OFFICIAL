import Link from "next/link";
import {
  Sparkles,
  Layers,
  BookOpen,
  Star,
  Calendar,
  Users,
  Phone,
  Settings,
  MessageCircle,
  ChevronRight,
} from "lucide-react";
import { getContent, getSectionTimestamps } from "@/lib/storage";
import { timeAgo } from "@/lib/utils";

const SECTION_META = [
  { id: "hero" as const, name: "Hero", icon: Sparkles, description: "Main banner and headline" },
  { id: "services" as const, name: "Services", icon: Layers, description: "What you offer" },
  { id: "story" as const, name: "About", icon: BookOpen, description: "Your bio and story" },
  { id: "testimonials" as const, name: "Reviews", icon: Star, description: "Client testimonials" },
  { id: "events" as const, name: "Events", icon: Calendar, description: "Upcoming events" },
  { id: "providers" as const, name: "Providers", icon: Users, description: "Your wellness network" },
  { id: "contact" as const, name: "Contact", icon: Phone, description: "How to reach you" },
  { id: "settings" as const, name: "Settings", icon: Settings, description: "Site configuration" },
];

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len).trimEnd() + "...";
}

export default async function ContentPage() {
  const [hero, services, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
      getContent("hero"),
      getContent("services"),
      getContent("testimonials"),
      getContent("events"),
      getContent("providers"),
      getContent("contact"),
      getContent("settings"),
      getSectionTimestamps(),
    ]);

  const sectionData: Record<string, { preview: string; status: "live" | "empty" | "configured"; count?: string; chatPrompt: string }> = {
    hero: {
      preview: truncate(hero.headline.replace(/\n/g, " "), 50),
      status: hero.headline ? "live" : "empty",
      chatPrompt: "Update my hero headline",
    },
    services: {
      preview: services.services.slice(0, 3).map((s) => s.name).join(", "),
      status: services.services.length > 0 ? "live" : "empty",
      count: `${services.services.length}`,
      chatPrompt: "Update my services",
    },
    story: {
      preview: truncate(hero.tagline || "Your story", 50),
      status: "live",
      chatPrompt: "Update my about section",
    },
    testimonials: {
      preview: testimonials.testimonials.length > 0
        ? truncate(testimonials.testimonials[0].quote, 50)
        : "No reviews yet",
      status: testimonials.testimonials.length > 0 ? "live" : "empty",
      count: `${testimonials.testimonials.length}`,
      chatPrompt: "Add a new testimonial",
    },
    events: {
      preview: events.events.length > 0
        ? events.events[0].title
        : "No upcoming events",
      status: events.events.length > 0 ? "live" : "empty",
      count: `${events.events.length}`,
      chatPrompt: "Add a new event",
    },
    providers: {
      preview: providers.providers.slice(0, 3).map((p) => p.name).join(", "),
      status: providers.providers.length > 0 ? "live" : "empty",
      count: `${providers.providers.length}`,
      chatPrompt: "Update my providers list",
    },
    contact: {
      preview: [contact.phone, contact.email].filter(Boolean).join(" · "),
      status: contact.phone ? "live" : "empty",
      chatPrompt: "Update my contact information",
    },
    settings: {
      preview: settings.siteName,
      status: "configured",
      chatPrompt: "Update my site settings",
    },
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          CONTENT
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-white mt-1">
          Your site sections
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Each card is a section of your website. Click to edit with AI.
        </p>
      </div>

      {/* Section cards */}
      <div className="space-y-2">
        {SECTION_META.map((section) => {
          const data = sectionData[section.id];
          return (
            <Link
              key={section.id}
              href={`/dashboard/chat`}
              className="group flex items-center gap-4 bg-[#141414] border border-[#262626] rounded-lg px-5 py-4 hover:bg-[#1a1a1a] hover:border-[#333] transition-all duration-200"
            >
              {/* Icon + status */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-lg bg-[#1c1c1c] border border-[#262626] flex items-center justify-center group-hover:border-violet-600/30 group-hover:bg-violet-600/5 transition-all duration-200">
                  <section.icon className="w-4.5 h-4.5 text-zinc-500 group-hover:text-violet-400 transition-colors duration-200" />
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#141414] ${
                  data.status === "live" ? "bg-emerald-500" :
                  data.status === "configured" ? "bg-blue-500" :
                  "bg-zinc-600"
                }`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-white">
                    {section.name}
                  </h3>
                  {data.count && (
                    <span className="font-mono text-[10px] text-zinc-500 bg-[#1c1c1c] px-1.5 py-0.5 rounded">
                      {data.count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                  {data.preview}
                </p>
              </div>

              {/* Timestamp */}
              {timestamps[section.id] && (
                <span className="hidden sm:block font-mono text-[10px] text-zinc-600 shrink-0">
                  {timeAgo(timestamps[section.id])}
                </span>
              )}

              {/* Hover action */}
              <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <span className="text-xs text-violet-400 font-medium hidden sm:block">Edit</span>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors duration-200" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick tip */}
      <div className="mt-6 flex items-center gap-3 px-5 py-3 rounded-lg bg-violet-600/5 border border-violet-600/10">
        <MessageCircle className="w-4 h-4 text-violet-400 shrink-0" />
        <p className="text-xs text-zinc-400">
          <span className="text-violet-400 font-medium">Tip:</span> You can also update any section by telling the AI what you want — &ldquo;add a new event next Saturday&rdquo;
        </p>
      </div>
    </div>
  );
}
