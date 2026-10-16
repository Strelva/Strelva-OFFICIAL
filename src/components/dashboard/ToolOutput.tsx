"use client";

/**
 * What Strelva shows inside a conversation when it looks something up (XA ·
 * AS2). Each answer is a sentence with one real object under it: the week as
 * a sentence, the site's pages as open rows, photos as the photos, a preview
 * as the page itself. No cards, no icon headers, no collapsing chrome; status
 * only where something needs the owner.
 */
import { XaPage, XaRow, XaRows, XaSays, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
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

const LOOKING: Record<string, string> = {
  show_report: "Reading this week's numbers",
  show_content: "Reading your site's pages",
  show_photos: "Opening your photos",
  show_connections: "Checking your connected accounts",
  preview_site: "Opening your site",
};

function plural(n: number, one: string, many: string) { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

function ReportOutput({ data }: { data: ReportData }) {
  const dashboard = useDashboardOptional();
  const week = data.pageViews.thisWeek;
  const trend = data.trend?.percent ? ` That is ${Math.abs(data.trend.percent)}% ${data.trend.percent > 0 ? "more" : "fewer"} than last week.` : "";
  return <XaSays links={[<XaTextLink key="report" href={dashboard?.dashboardHref("/dashboard/reports") || "/dashboard/reports"}>Read the recap</XaTextLink>]}>
    {week > 0 ? `${plural(week, "person", "people")} found ${data.siteName} this week, and ${data.bookingClicks.thisWeek.toLocaleString()} clicked to book or called.${trend}` : `No one has found ${data.siteName} this week yet.`}
  </XaSays>;
}

function ContentOutput({ data }: { data: ContentData }) {
  const dashboard = useDashboardOptional();
  return <XaRows label="Your site's pages">
    {data.pages.map((page) => {
      const empty = page.sections.filter((section) => section.status === "empty").map((section) => section.label);
      const hidden = page.sections.filter((section) => !section.visible).map((section) => section.label);
      const shown = page.sections.filter((section) => section.visible).map((section) => section.label);
      return <XaRow key={page.slug} title={page.label}
        detail={empty.length ? `Still empty: ${empty.join(", ")}` : hidden.length ? `Hidden: ${hidden.join(", ")}` : shown.join(", ")}
        tone={empty.length ? "waits" : undefined}
        href={dashboard?.dashboardHref("/dashboard/site") || "/dashboard/site"} />;
    })}
  </XaRows>;
}

function PhotosOutput({ data }: { data: PhotoData }) {
  const dashboard = useDashboardOptional();
  const shown = data.photos.slice(0, 6);
  const href = dashboard?.dashboardHref("/dashboard/assets") || "/dashboard/assets";
  if (!shown.length) return <XaSays links={[<XaTextLink key="add" href={href}>Add photos</XaTextLink>]}>You have no photos yet. Your site uses Strelva&apos;s until you add your own.</XaSays>;
  return <div className="flex flex-col gap-2">
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Your photos">
      {shown.map((photo) => <li key={photo.id}>
        <img src={photo.url} alt="" width={96} height={96} className="block h-24 w-24 rounded-[var(--st-r-md)] object-cover" loading="lazy" />
      </li>)}
    </ul>
    <p className="m-0 text-[14px]"><XaTextLink href={href}>{data.total > shown.length ? `See all ${data.total} photos` : "Open your photos"}</XaTextLink></p>
  </div>;
}

function ConnectionsOutput({ data }: { data: ConnectionData }) {
  const dashboard = useDashboardOptional();
  const href = dashboard?.dashboardHref("/dashboard/integrations") || "/dashboard/integrations";
  return <div className="flex flex-col gap-2">
    {data.summary ? <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text-body)]">{data.summary}</p> : null}
    <XaRows label="Connected accounts">
      {data.connections.map((connection) => <XaRow key={connection.id} title={connection.name}
        detail={connection.status === "needs_attention" ? "Needs you: sign in again" : !connection.connected ? "Not connected yet" : connection.description}
        tone={connection.status === "needs_attention" ? "waits" : undefined} href={href} />)}
    </XaRows>
  </div>;
}

function PreviewOutput({ data }: { data: PreviewData }) {
  const address = data.url.replace(/^https?:\/\//, "").replace(/\/$/, "") || data.siteName || "Your site";
  return <div className="flex flex-col gap-2">
    <XaPage address={address} flat label={`${address}, as visitors see it`}>
      <div className="relative -mx-6 -mb-7 -mt-6 aspect-video overflow-hidden">
        {data.screenshotUrl
          ? <img src={data.screenshotUrl} alt="" className="h-full w-full object-cover object-top" />
          : <iframe src={data.url} className="pointer-events-none h-full w-full border-0" title={`${address} preview`} tabIndex={-1} />}
      </div>
    </XaPage>
    {data.url ? <p className="m-0 text-[14px]"><a className="font-medium text-[var(--st-accent)] hover:underline" href={data.url} target="_blank" rel="noopener noreferrer">Open the live site</a></p> : null}
  </div>;
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
            // Default the nested metrics — a malformed streamed payload with a
            // missing pageViews/bookingClicks used to crash ReportOutput (and,
            // with no error boundary, blank the whole chat).
            pageViews: (data.pageViews as ReportData["pageViews"]) ?? { total: 0, thisWeek: 0, today: 0 },
            bookingClicks: (data.bookingClicks as ReportData["bookingClicks"]) ?? { total: 0, thisWeek: 0, today: 0 },
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
  if (status === "pending" || status === "running") {
    return <div className={className}><XaWorking title={LOOKING[toolName] ?? "Looking it up"} steps={[]} /></div>;
  }
  if (status === "error") {
    const errorMsg = typeof result === "object" && result !== null ? (result as Record<string, unknown>).error as string | undefined : undefined;
    return <div className={className} role="alert"><XaSays>{errorMsg ? `That didn't work: ${errorMsg}` : "That didn't work. Nothing changed. Ask again and Strelva tries once more."}</XaSays></div>;
  }
  const parsed = parseResult(toolName, result);
  return (
    <div className={className}>
      {parsed.type === "report" && <ReportOutput data={parsed.data} />}
      {parsed.type === "content" && <ContentOutput data={parsed.data} />}
      {parsed.type === "photos" && <PhotosOutput data={parsed.data} />}
      {parsed.type === "connections" && <ConnectionsOutput data={parsed.data} />}
      {parsed.type === "preview" && <PreviewOutput data={parsed.data} />}
      {parsed.type === "unknown" && <p className="m-0 text-[14px] text-[var(--st-text-2)]">Strelva finished this step.</p>}
    </div>
  );
}
