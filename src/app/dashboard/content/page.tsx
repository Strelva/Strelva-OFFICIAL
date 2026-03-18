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
} from "lucide-react";
import { getContent } from "@/lib/storage";

const SECTION_META = [
  { id: "hero" as const, name: "Hero", icon: Sparkles },
  { id: "services" as const, name: "Services", icon: Layers },
  { id: "story" as const, name: "About", icon: BookOpen },
  { id: "testimonials" as const, name: "Testimonials", icon: Star },
  { id: "events" as const, name: "Events", icon: Calendar },
  { id: "providers" as const, name: "Providers", icon: Users },
  { id: "contact" as const, name: "Contact", icon: Phone },
  { id: "settings" as const, name: "Settings", icon: Settings },
];

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len).trimEnd() + "...";
}

export default async function ContentPage() {
  const [hero, services, testimonials, events, providers, contact, settings] =
    await Promise.all([
      getContent("hero"),
      getContent("services"),
      getContent("testimonials"),
      getContent("events"),
      getContent("providers"),
      getContent("contact"),
      getContent("settings"),
    ]);

  const previews: Record<string, string> = {
    hero: truncate(hero.headline.replace(/\n/g, " "), 40),
    services: `${services.services.length} services`,
    story: "Updated 3d ago",
    testimonials: `${testimonials.testimonials.length} reviews`,
    events: `${events.events.length} upcoming`,
    providers: `${providers.providers.length} providers`,
    contact: contact.phone,
    settings: settings.siteName,
  };

  const timestamps: Record<string, string> = {
    hero: "2d ago",
    services: "5d ago",
    story: "1w ago",
    testimonials: "1d ago",
    events: "3d ago",
    providers: "2w ago",
    contact: "2h ago",
    settings: "1w ago",
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          CONTENT
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-white mt-1">
          Your site sections
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Tap any section to update it with AI.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {SECTION_META.map((section) => (
          <Link
            key={section.id}
            href="/dashboard/chat"
            className="group relative overflow-hidden bg-[#141414] border border-[#262626] rounded-lg p-4 hover:border-[#333] hover:border-l-2 hover:border-l-violet-600 transition-all duration-150"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
            <div className="relative flex items-start gap-3">
              <div className="w-8 h-8 rounded-md bg-violet-600/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-150">
                <section.icon className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">
                  {section.name}
                </h3>
                <p className="font-mono text-xs text-zinc-500 mt-1">
                  {previews[section.id]}
                </p>
                <p className="font-mono text-[10px] text-zinc-600 mt-2">
                  Last edited {timestamps[section.id]}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
