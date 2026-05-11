"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  MousePointerClick,
  Activity,
  Layers,
  Image as ImageIcon,
  Link2,
  CircleCheck,
  Circle,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { useDashboardOptional } from "./DashboardContext";

/* ─────────────────────────────────────────────────────────────
   TYPES — structured data returned by inline tools
   ───────────────────────────────────────────────────────────── */

export interface ReportData {
  siteName: string;
  pageViews: { total: number; thisWeek: number; today: number };
  bookingClicks: { total: number; thisWeek: number; today: number };
  siteScore: number;
  trend?: { direction: "up" | "down" | "flat"; percent: number };
  weekLabel?: string;
}

export interface ContentSection {
  type: string;
  label: string;
  status: "live" | "empty" | "configured";
  itemCount?: number;
  visible: boolean;
}

export interface ContentData {
  pages: Array<{
    slug: string;
    label: string;
    sections: ContentSection[];
  }>;
}

export interface PhotoData {
  photos: Array<{
    id: string;
    url: string;
    filename: string;
  }>;
  total: number;
}

export interface ConnectionData {
  connections: Array<{
    id: string;
    name: string;
    icon: string;
    connected: boolean;
    status?: "no_signal" | "signal_available" | "ai_using_it" | "needs_attention" | "can_act_here";
    description?: string;
    addsIntelligence?: string;
    aiCanUseThisTo?: string[];
    exampleInsight?: string;
    actionPaths?: string[];
    sourceProof?: string;
  }>;
  summary?: string;
}

export interface PreviewData {
  url: string;
  screenshotUrl?: string;
  siteName?: string;
}

type ToolResult =
  | { type: "report"; data: ReportData }
  | { type: "content"; data: ContentData }
  | { type: "photos"; data: PhotoData }
  | { type: "connections"; data: ConnectionData }
  | { type: "preview"; data: PreviewData }
  | { type: "unknown"; data: unknown };

/* ─────────────────────────────────────────────────────────────
   PROPS
   ───────────────────────────────────────────────────────────── */

interface ToolOutputProps {
  toolName: string;
  result: unknown;
  status: "pending" | "running" | "complete" | "error";
  className?: string;
}

/* ─────────────────────────────────────────────────────────────
   LOADING SHIMMER
   ───────────────────────────────────────────────────────────── */

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded bg-gray-bg animate-pulse",
        className
      )}
    />
  );
}

function PendingState({ toolName }: { toolName: string }) {
  const label =
    toolName === "show_report" ? "Loading report..." :
    toolName === "show_content" ? "Loading content..." :
    toolName === "show_photos" ? "Loading photos..." :
    toolName === "show_connections" ? "Loading connections..." :
    toolName === "preview_site" ? "Loading preview..." :
    "Loading...";

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-border/50 flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-gray-bg animate-pulse" />
        <span className="text-[12px] text-gray-muted">{label}</span>
      </div>
      <div className="p-4 space-y-3">
        <Shimmer className="h-8 w-1/2" />
        <Shimmer className="h-4 w-3/4" />
        <Shimmer className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   REPORT OUTPUT — metrics cards
   ───────────────────────────────────────────────────────────── */

function ReportOutput({ data }: { data: ReportData }) {
  const [expanded, setExpanded] = useState(true);
  const TrendIcon = data.trend?.direction === "up" ? TrendingUp :
                    data.trend?.direction === "down" ? TrendingDown : Minus;
  const trendColor = data.trend?.direction === "up" ? "text-success" :
                     data.trend?.direction === "down" ? "text-terra" : "text-gray-muted";

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-border/50 hover:bg-gray-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-warm-black">Weekly Report</span>
          {data.weekLabel && (
            <span className="text-[11px] text-gray-muted">({data.weekLabel})</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 animate-fade-in-up">
          {/* Headline */}
          <p className="text-[15px] font-medium text-warm-black mb-4">
            {data.pageViews.thisWeek > 0
              ? `${data.pageViews.thisWeek} people found you this week`
              : "No visitors yet this week"}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* Visitors */}
            <div className="rounded-lg bg-glass border border-glass-border p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Eye className="w-3 h-3 text-gray-muted" strokeWidth={1.5} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-muted">Visitors</span>
              </div>
              <div className="text-[20px] font-medium text-warm-black tracking-tight">
                {data.pageViews.thisWeek}
              </div>
              <div className="text-[11px] text-gray-muted mt-0.5">
                {data.pageViews.total.toLocaleString()} all time
              </div>
            </div>

            {/* Clicks */}
            <div className="rounded-lg bg-glass border border-glass-border p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <MousePointerClick className="w-3 h-3 text-gray-muted" strokeWidth={1.5} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-muted">Clicks</span>
              </div>
              <div className="text-[20px] font-medium text-warm-black tracking-tight">
                {data.bookingClicks.thisWeek}
              </div>
              <div className="text-[11px] text-gray-muted mt-0.5">
                {data.bookingClicks.total.toLocaleString()} all time
              </div>
            </div>

            {/* Score / Trend */}
            <div className="rounded-lg bg-glass border border-glass-border p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendIcon className={cn("w-3 h-3", trendColor)} strokeWidth={1.5} />
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-muted">Trend</span>
              </div>
              <div className={cn("text-[20px] font-medium tracking-tight", trendColor)}>
                {data.trend?.percent ? `${data.trend.percent > 0 ? "+" : ""}${data.trend.percent}%` : "—"}
              </div>
              <div className="text-[11px] text-gray-muted mt-0.5">
                vs last week
              </div>
            </div>
          </div>

          {/* Site score bar */}
          {data.siteScore !== undefined && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-gray-muted">Site completeness</span>
                <span className="text-[11px] font-mono text-warm-black">{data.siteScore}%</span>
              </div>
              <div className="h-1.5 bg-gray-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${data.siteScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CONTENT OUTPUT — collapsible site tree
   ───────────────────────────────────────────────────────────── */

function ContentOutput({ data }: { data: ContentData }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set(["home"]));

  const togglePage = (slug: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const totalSections = data.pages.reduce((sum, p) => sum + p.sections.length, 0);
  const liveSections = data.pages.reduce(
    (sum, p) => sum + p.sections.filter((s) => s.status === "live").length,
    0
  );

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-border/50 hover:bg-gray-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-warm-black">Site Content</span>
          <span className="text-[11px] text-gray-muted">
            {liveSections}/{totalSections} sections live
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="animate-fade-in-up">
          {data.pages.map((page) => (
            <div key={page.slug}>
              {/* Page row */}
              <button
                onClick={() => togglePage(page.slug)}
                className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-gray-bg transition-colors border-b border-gray-border/30"
              >
                {expandedPages.has(page.slug) ? (
                  <ChevronDown className="w-3 h-3 text-gray-muted" strokeWidth={1.5} />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-muted rotate-[-90deg]" strokeWidth={1.5} />
                )}
                <span className="text-[12px] font-medium text-warm-black">{page.label}</span>
                <span className="text-[10px] font-mono text-gray-muted">
                  {page.sections.length} sections
                </span>
              </button>

              {/* Sections */}
              {expandedPages.has(page.slug) && (
                <div className="pl-8 py-1 space-y-0.5">
                  {page.sections.map((section) => (
                    <div
                      key={section.type}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded",
                        !section.visible && "opacity-50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          section.status === "live" ? "bg-success" :
                          section.status === "configured" ? "bg-gray-muted" :
                          "bg-gray-subtle"
                        )}
                      />
                      <span className="text-[12px] text-warm-black flex-1">{section.label}</span>
                      {section.itemCount !== undefined && (
                        <span className="text-[10px] font-mono text-gray-muted">{section.itemCount}</span>
                      )}
                      {!section.visible && (
                        <span className="text-[9px] font-mono uppercase text-gray-muted">hidden</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PHOTOS OUTPUT — thumbnail grid
   ───────────────────────────────────────────────────────────── */

function PhotosOutput({ data }: { data: PhotoData }) {
  const dashboard = useDashboardOptional();
  const [expanded, setExpanded] = useState(true);
  const displayPhotos = data.photos.slice(0, 6);
  const remaining = data.total - displayPhotos.length;

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-border/50 hover:bg-gray-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-warm-black">Photos</span>
          <span className="text-[11px] text-gray-muted">{data.total} total</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 animate-fade-in-up">
          {displayPhotos.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {displayPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-bg border border-gray-border"
                  >
                    <Image
                      src={photo.url}
                      alt={photo.filename}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  </div>
                ))}
              </div>
              {remaining > 0 && (
                <a
                  href={dashboard?.dashboardHref("/dashboard/assets") || "/dashboard/assets"}
                  className="flex items-center justify-center gap-1.5 mt-3 py-2 text-[12px] text-accent hover:text-accent/80 transition-colors"
                >
                  View all {data.total} photos
                  <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
                </a>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              <ImageIcon className="w-6 h-6 text-gray-muted mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[12px] text-gray-muted">No photos uploaded yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   CONNECTIONS OUTPUT — integration status cards
   ───────────────────────────────────────────────────────────── */

function ConnectionsOutput({ data }: { data: ConnectionData }) {
  const [expanded, setExpanded] = useState(true);
  const usefulCount = data.connections.filter((c) => c.status === "ai_using_it" || c.status === "can_act_here").length;

  const statusLabel: Record<NonNullable<ConnectionData["connections"][number]["status"]>, string> = {
    no_signal: "No signal",
    signal_available: "Signal available",
    ai_using_it: "AI using it",
    needs_attention: "Needs attention",
    can_act_here: "Can act here",
  };

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-border/50 hover:bg-gray-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-warm-black">AI intelligence sources</span>
          <span className="text-[11px] text-gray-muted">{usefulCount} usable now</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-3 animate-fade-in-up space-y-1.5">
          {data.summary && (
            <p className="px-1 pb-2 text-[12px] leading-relaxed text-gray-muted">{data.summary}</p>
          )}
          {data.connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-glass border border-glass-border"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-bg flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-gray-fg">{conn.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-warm-black block">{conn.name}</span>
                  {conn.status && (
                    <span className="rounded-full bg-gray-bg px-2 py-0.5 text-[10px] font-medium text-gray-muted">
                      {statusLabel[conn.status]}
                    </span>
                  )}
                </div>
                {conn.description && (
                  <span className="text-[11px] text-gray-muted block leading-relaxed">{conn.description}</span>
                )}
                {conn.aiCanUseThisTo?.length ? (
                  <span className="mt-1 text-[11px] text-gray-faint block leading-relaxed">
                    AI can: {conn.aiCanUseThisTo.slice(0, 2).join("; ")}
                  </span>
                ) : null}
                {conn.sourceProof && (
                  <span className="mt-1 text-[10px] text-gray-faint block">{conn.sourceProof}</span>
                )}
              </div>
              {conn.status === "ai_using_it" || conn.status === "can_act_here" ? (
                <CircleCheck className="w-4 h-4 text-success shrink-0" strokeWidth={1.5} />
              ) : conn.status === "needs_attention" ? (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.5} />
              ) : (
                <Circle className="w-4 h-4 text-gray-subtle shrink-0" strokeWidth={1.5} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PREVIEW OUTPUT — iframe or screenshot thumbnail
   ───────────────────────────────────────────────────────────── */

function PreviewOutput({ data }: { data: PreviewData }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-border/50 hover:bg-gray-bg transition-colors"
      >
        <div className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-accent" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-warm-black">Site Preview</span>
          {data.siteName && (
            <span className="text-[11px] text-gray-muted">{data.siteName}</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-muted" strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="p-4 animate-fade-in-up">
          {data.screenshotUrl ? (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-bg border border-gray-border">
              <Image
                src={data.screenshotUrl}
                alt="Site preview"
                fill
                className="object-cover"
                sizes="400px"
              />
            </div>
          ) : (
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-bg border border-gray-border">
              <iframe
                src={data.url}
                className="w-full h-full pointer-events-none"
                title="Site preview"
              />
            </div>
          )}
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 mt-3 py-2 text-[12px] text-accent hover:text-accent/80 transition-colors"
          >
            Open site
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   ERROR STATE
   ───────────────────────────────────────────────────────────── */

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-terra/30 bg-terra/5 p-4 flex items-start gap-3">
      <AlertCircle className="w-4 h-4 text-terra shrink-0 mt-0.5" strokeWidth={1.5} />
      <div>
        <p className="text-[12px] font-medium text-terra">Something went wrong</p>
        {message && <p className="text-[11px] text-terra/80 mt-0.5">{message}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   RESULT PARSER — converts raw tool result to typed data
   ───────────────────────────────────────────────────────────── */

function parseResult(toolName: string, result: unknown): ToolResult {
  try {
    const data = result as Record<string, unknown>;

    switch (toolName) {
      case "show_report":
        return {
          type: "report",
          data: {
            siteName: (data.siteName as string) || "Your site",
            pageViews: data.pageViews as ReportData["pageViews"],
            bookingClicks: data.bookingClicks as ReportData["bookingClicks"],
            siteScore: (data.siteScore as number) || 0,
            trend: data.trend as ReportData["trend"],
            weekLabel: data.weekLabel as string | undefined,
          },
        };

      case "show_content":
        return {
          type: "content",
          data: {
            pages: (data.pages as ContentData["pages"]) || [],
          },
        };

      case "show_photos":
        return {
          type: "photos",
          data: {
            photos: (data.photos as PhotoData["photos"]) || [],
            total: (data.total as number) || 0,
          },
        };

      case "show_connections":
        return {
          type: "connections",
          data: {
            connections: (data.connections as ConnectionData["connections"]) || [],
            summary: data.summary as string | undefined,
          },
        };

      case "preview_site":
        return {
          type: "preview",
          data: {
            url: (data.url as string) || "",
            screenshotUrl: data.screenshotUrl as string | undefined,
            siteName: data.siteName as string | undefined,
          },
        };

      default:
        return { type: "unknown", data };
    }
  } catch {
    return { type: "unknown", data: result };
  }
}

/* ─────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────────────────────── */

export function ToolOutput({ toolName, result, status, className }: ToolOutputProps) {
  // Pending/running state
  if (status === "pending" || status === "running") {
    return (
      <div className={className}>
        <PendingState toolName={toolName} />
      </div>
    );
  }

  // Error state
  if (status === "error") {
    const errorMsg = typeof result === "object" && result !== null
      ? (result as Record<string, unknown>).error as string | undefined
      : undefined;
    return (
      <div className={className}>
        <ErrorState message={errorMsg} />
      </div>
    );
  }

  // Parse and render result
  const parsed = parseResult(toolName, result);

  return (
    <div className={className}>
      {parsed.type === "report" && <ReportOutput data={parsed.data} />}
      {parsed.type === "content" && <ContentOutput data={parsed.data} />}
      {parsed.type === "photos" && <PhotosOutput data={parsed.data} />}
      {parsed.type === "connections" && <ConnectionsOutput data={parsed.data} />}
      {parsed.type === "preview" && <PreviewOutput data={parsed.data} />}
      {parsed.type === "unknown" && (
        <div className="rounded-xl border border-gray-border bg-surface p-4">
          <pre className="text-[11px] font-mono text-gray-muted overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
