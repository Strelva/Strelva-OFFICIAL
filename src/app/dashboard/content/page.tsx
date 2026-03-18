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

const SECTIONS = [
  {
    id: "hero",
    name: "Hero",
    icon: Sparkles,
    description: "Headline, tagline, and call-to-action",
    prompt: "Update my homepage headline and tagline",
    lastEdited: "2d ago",
  },
  {
    id: "services",
    name: "Services",
    icon: Layers,
    description: "Your stretching services and pricing",
    prompt: "Show me my current services",
    lastEdited: "5d ago",
  },
  {
    id: "story",
    name: "About",
    icon: BookOpen,
    description: "Your story and background",
    prompt: "Update my about section",
    lastEdited: "1w ago",
  },
  {
    id: "testimonials",
    name: "Testimonials",
    icon: Star,
    description: "Client reviews and quotes",
    prompt: "Add a new testimonial",
    lastEdited: "1d ago",
  },
  {
    id: "events",
    name: "Events",
    icon: Calendar,
    description: "Upcoming events and workshops",
    prompt: "Add a new event",
    lastEdited: "3d ago",
  },
  {
    id: "providers",
    name: "Providers",
    icon: Users,
    description: "Your wellness network directory",
    prompt: "Show me my provider list",
    lastEdited: "2w ago",
  },
  {
    id: "contact",
    name: "Contact",
    icon: Phone,
    description: "Hours, location, and contact info",
    prompt: "Update my hours",
    lastEdited: "2h ago",
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings,
    description: "Site name, tagline, and SEO",
    prompt: "Update my site description for SEO",
    lastEdited: "1w ago",
  },
];

export default function ContentPage() {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Content
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Tap any section to update it with AI.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.id}
            href="/dashboard/chat"
            className="group bg-[#141414] border border-[#262626] rounded-lg p-5 hover:bg-[#1c1c1c] hover:border-[#333] transition-colors duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-violet-600/20 flex items-center justify-center shrink-0">
                <section.icon className="w-4 h-4 text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors duration-150">
                  {section.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  {section.description}
                </p>
                <p className="text-xs font-mono text-zinc-600 mt-2">
                  {section.lastEdited}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
