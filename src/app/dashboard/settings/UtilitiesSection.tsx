"use client";

import Link from "next/link";
import { Download, Image as ImageIcon, Link2, Sparkles } from "lucide-react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

const UTILITIES = [
  {
    title: "Brand Kit",
    description: "Tell Strelva about your business — what you do, your voice, and your media.",
    href: "/dashboard/brand-kit",
    icon: Sparkles,
  },
  {
    title: "Connections",
    description: "Connect the accounts Strelva manages — Google Business, reviews, booking.",
    href: "/dashboard/integrations",
    icon: Link2,
  },
  {
    title: "Photo library",
    description: "Upload and reuse real photos, logos, and files Strelva can reference in chat.",
    href: "/dashboard/assets",
    icon: ImageIcon,
  },
  {
    title: "Export & handoff",
    description: "Download content and asset manifests or start a provider handoff.",
    href: "/dashboard/settings#ownership",
    icon: Download,
  },
] as const;

export function UtilitiesSection() {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);

  return (
    <div className="grid gap-3">
      {UTILITIES.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={dashboardHref(item.href)}
            className="group flex items-start gap-4 rounded-xl border border-glass-border bg-glass px-4 py-4 transition-colors hover:border-accent/35"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim text-accent">
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-warm-white group-hover:text-white">
                {item.title}
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-gray-muted">
                {item.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
