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
  },
  {
    id: "services",
    name: "Services",
    icon: Layers,
    description: "Your stretching services and pricing",
    prompt: "Show me my current services",
  },
  {
    id: "story",
    name: "About",
    icon: BookOpen,
    description: "Your story and background",
    prompt: "Update my about section",
  },
  {
    id: "testimonials",
    name: "Testimonials",
    icon: Star,
    description: "Client reviews and quotes",
    prompt: "Add a new testimonial",
  },
  {
    id: "events",
    name: "Events",
    icon: Calendar,
    description: "Upcoming events and workshops",
    prompt: "Add a new event",
  },
  {
    id: "providers",
    name: "Providers",
    icon: Users,
    description: "Your wellness network directory",
    prompt: "Show me my provider list",
  },
  {
    id: "contact",
    name: "Contact",
    icon: Phone,
    description: "Hours, location, and contact info",
    prompt: "Update my hours",
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings,
    description: "Site name, tagline, and SEO",
    prompt: "Update my site description for SEO",
  },
];

export default function ContentPage() {
  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Content</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Tap any section to update it with AI.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.id}
            href={`/dashboard/chat`}
            className="group bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:bg-zinc-800/80 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-600/10 flex items-center justify-center shrink-0">
                <section.icon className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">
                  {section.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  {section.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
