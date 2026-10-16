import type { ActivityEntry } from "@/lib/storage/activity-store";
import type { OwnerRetentionSignals } from "@/lib/retention";
import type { UnifiedEvent } from "@/lib/types";
import { XaAnswers, XaHeadline, XaInitial, XaLabel, XaLede, XaMark, XaPebbleScene, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { ActivityFeed } from "./ActivityFeed";
import { DoThisNextCard } from "./DoThisNextCard";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { OnboardingWizard } from "./OnboardingWizard";
import { QueuePage } from "./QueuePage";
import { RetentionPanel } from "./RetentionPanel";
import { TodayComposer } from "./TodayComposer";
import styles from "./xa/dashboard-xa.module.css";

export interface DashboardTodayProps {
  tenant: string;
  ownerName: string;
  businessName: string;
  verdict: string;
  isFresh: boolean;
  isOperator: boolean;
  numbers: { foundTotal: number; foundWeek: number; actionsTotal: number; bookedWeek: number; calledWeek: number };
  needsYou: { pending: UnifiedEvent[]; resolved: UnifiedEvent[]; pendingCount: number; staleSectionCount: number };
  strelvaWork: ActivityEntry[];
  suggestion: { title: string; prompt: string } | null;
  leads: { count: number; recent: { id: string; name: string; email?: string | null; message?: string | null; createdAt: string }[] };
  retentionSignals: OwnerRetentionSignals;
  hrefs: { reports?: string; history: string; leads: string; site: string; live?: string | null };
}

/** "Dr. Amy Lin" greets as "Dr. Lin"; everyone else by first name. */
export function greetingName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "there";
  if (/^(dr|mr|mrs|ms)\.?$/i.test(parts[0]!) && parts.length > 1) return `${parts[0]!.replace(/\.?$/, ".")} ${parts[parts.length - 1]}`;
  return parts[0]!;
}

function plural(n: number, one: string, many: string) { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

/**
 * Today on the website dashboard (XA · O1). One column to act from: the
 * greeting, the composer with whatever waits on top, then Needs you in place.
 * Beside it, Pebble and what Strelva did, each line with its time.
 */
export function DashboardToday(props: DashboardTodayProps) {
  const { tenant, ownerName, businessName, verdict, isFresh, isOperator, numbers, needsYou, strelvaWork, suggestion, leads, retentionSignals, hrefs } = props;
  const first = needsYou.pending.find((event) => event.status === "pending" && event.type !== "change_request") ?? null;
  const waits = needsYou.pendingCount;
  const lede = isFresh ? verdict
    : waits > 0 ? `${waits === 1 ? "One change waits" : `${waits} changes wait`} for your yes. ${verdict}`
      : `Nothing needs you. ${verdict}`;
  const numbersLine = isFresh ? null
    : `${plural(numbers.foundTotal, "person has", "people have")} found you so far, ${numbers.foundWeek.toLocaleString()} in the last 7 days. ${numbers.actionsTotal > 0 ? `${plural(numbers.actionsTotal, "visitor", "visitors")} clicked to book or called${numbers.bookedWeek + numbers.calledWeek > 0 ? `, ${(numbers.bookedWeek + numbers.calledWeek).toLocaleString()} this week` : ""}.` : "No one has clicked to book or called yet."}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className={styles.split}>
        <div className={styles.splitLead}>
          <XaMark size={40} />
          <div className={styles.greeting}>
            <XaHeadline size="lg">Hello, {greetingName(ownerName)}.</XaHeadline>
            <XaLede>{lede}</XaLede>
          </div>
          <TodayComposer businessName={businessName} waiting={first ? { title: first.title, from: first.source === "ai" ? "strelva" : first.source === "google" || first.source === "yelp" ? "a review" : "your website" } : null} />
          {!isFresh ? <OnboardingWizard /> : null}
          <OnboardingChecklist tenant={tenant} defaultOpen={isFresh} />
          {suggestion ? <DoThisNextCard title={suggestion.title} prompt={suggestion.prompt} /> : null}
          {waits > 0 ? (
            <QueuePage
              initialPending={needsYou.pending}
              initialResolved={needsYou.resolved}
              pendingCount={needsYou.pendingCount}
              staleSectionCount={needsYou.staleSectionCount}
              isOperator={isOperator}
              compact
            />
          ) : null}
          {numbersLine ? <section className="flex flex-col gap-3" aria-labelledby="found-label">
            <XaLabel id="found-label">Who found you</XaLabel>
            <p className="m-0 max-w-[560px] text-[15px] leading-[1.5] text-[var(--st-text-body)]">{numbersLine}</p>
            {hrefs.reports ? <p className="m-0 text-[14px]"><XaTextLink href={hrefs.reports}>Read this week&apos;s report</XaTextLink></p> : null}
          </section> : null}
          {!isFresh ? <RetentionPanel signals={retentionSignals} /> : null}
        </div>

        <aside className={styles.splitSide} aria-label="What happened">
          <XaPebbleScene pose={isFresh ? "waving" : waits > 0 ? "website" : "resting"} size={280} label={isFresh ? "Pebble waving hello" : waits > 0 ? "Pebble with your website" : "Pebble resting beside your site"} />
          {isFresh ? (
            <section className="flex flex-col gap-3" aria-labelledby="next-label">
              <XaLabel id="next-label">What happens next</XaLabel>
              <XaAnswers labelWidth={112} rows={[
                ["This week", "Strelva keeps your site and Google listing healthy. Nothing for you to do."],
                ["First report", "In about a week, here and by email: who found you and what changed."],
                ["Any time", "Ask Strelva in plain words. Bigger changes wait in Needs you for your yes."],
              ]} />
            </section>
          ) : (
            <ActivityFeed activity={strelvaWork} historyHref={hrefs.history} limit={4} />
          )}
          {leads.recent.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="leads-label">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <XaLabel id="leads-label">Who reached out</XaLabel>
                <span className="text-[13px] text-[var(--st-text-3)]">{plural(leads.count, "inquiry", "inquiries")} this month</span>
              </div>
              <XaRows label="Who reached out">
                {leads.recent.slice(0, 3).map((lead) => (
                  <XaRow key={lead.id} lead={<XaInitial name={lead.name} shape="round" size={30} />} title={lead.name}
                    detail={lead.message ? lead.message.slice(0, 90) : lead.email || undefined}
                    meta={new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    href={lead.email ? `mailto:${lead.email}` : hrefs.leads} wrapOnPhone />
                ))}
              </XaRows>
              <p className="m-0 text-[14px]"><XaTextLink href={hrefs.leads}>See every inquiry</XaTextLink></p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
