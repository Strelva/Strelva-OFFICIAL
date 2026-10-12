import { StTextButton } from "@/components/ui/strelva/Kit";
import { ArrowLeft } from "lucide-react";

/** Existing owner-entry resolution owns whether this migration bar is shown. */
export function DashboardBackBar({ businessName, homeHref, route }: { businessName: string; homeHref: string; route: string }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-border bg-canvas px-6 py-2 text-sm text-gray-muted" data-workspace-theme="linen" data-owner-entry-back={route}>
    <StTextButton href={homeHref}><ArrowLeft size={14} aria-hidden="true" />Back to {businessName}</StTextButton>
    <span>This page is moving into your workspace. Same data either way.</span>
  </div>;
}
