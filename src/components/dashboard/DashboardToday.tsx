import type { ActivityEntry } from "@/lib/storage/activity-store";
import type { OwnerRetentionSignals } from "@/lib/retention";
import type { UnifiedEvent } from "@/lib/types";
import { XaAnswers, XaInitial, XaLabel, XaLede, XaMark, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import { BillingBanner } from "./BillingBanner";
import { ActivityFeed } from "./ActivityFeed";
import { DoThisNextCard } from "./DoThisNextCard";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { OnboardingWizard } from "./OnboardingWizard";
import { QueuePage } from "./QueuePage";
import { RetentionPanel } from "./RetentionPanel";
import { TodayComposer } from "./TodayComposer";
import { DashGreeting } from "./xa/DashboardXa";
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
  hrefs: { reports?: string; analytics?: string; history: string; leads: string; site: string; live?: string | null };
  /** Preview harnesses only: the fixture day's clock. Real pages use the wall clock. */
  now?: number;
}

function plural(n: number, one: string, many: string) { return `${n.toLocaleString()} ${n === 1 ? one : many}`; }

/**
 * Today on the website dashboard (XA · O1). One column to act from: the
 * greeting and this week's verdict, then the one change that waits, open as
 * the page it changes with the yes under it, then the composer. Each fact is
 * said once: the waiting count lives only in the Needs you header. Beside it,
 * what Strelva did and who reached out, each line with its time and actor.
 */
export function DashboardToday(props: DashboardTodayProps) {
  const { tenant, ownerName, businessName, verdict, isFresh, isOperator, numbers, needsYou, strelvaWork, suggestion, leads, retentionSignals, hrefs } = props;
  const waits = needsYou.pendingCount;
  const lede = isFresh || waits > 0 ? verdict : `Nothing needs you. ${verdict}`;
  const reached = numbers.bookedWeek + numbers.calledWeek;
  const numbersLine = isFresh ? null
    : `${plural(numbers.foundTotal, "person has", "people have")} found you so far. ${numbers.actionsTotal > 0 ? `${reached > 0 ? `${reached.toLocaleString()} clicked to book or called this week` : `${plural(numbers.actionsTotal, "visitor", "visitors")} clicked to book or called`}.` : "No one has clicked to book or called yet."}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className={styles.split}>
        <div className={styles.splitLead}>
          <XaMark size={40} />
          <div className={styles.greeting}>
            <DashGreeting name={ownerName} businessName={businessName} />
            <XaLede>{lede}</XaLede>
          </div>
          <BillingBanner />
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
          <TodayComposer businessName={businessName} />
          {!isFresh ? <OnboardingWizard /> : null}
          <OnboardingChecklist tenant={tenant} defaultOpen={isFresh} />
          {suggestion ? <DoThisNextCard title={suggestion.title} prompt={suggestion.prompt} /> : null}
          {!isFresh ? <RetentionPanel signals={suggestion ? { ...retentionSignals, ownerNextAction: "" } : retentionSignals} /> : null}
          {numbersLine ? <section className="flex flex-col gap-3" aria-labelledby="found-label">
            <XaLabel id="found-label">Who found you</XaLabel>
            <p className="m-0 max-w-[560px] text-[15px] leading-[1.5] text-[var(--st-text-body)]">{numbersLine}</p>
            {hrefs.analytics || hrefs.reports ? <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
              {hrefs.analytics ? <XaTextLink href={hrefs.analytics}>See visits and searches</XaTextLink> : null}
              {hrefs.reports ? <XaTextLink href={hrefs.reports}>Read this week&apos;s recap</XaTextLink> : null}
            </p> : null}
          </section> : null}
        </div>

        <aside className={styles.splitSide} aria-label="What happened">
          {isFresh ? (
            <section className="flex flex-col gap-3" aria-labelledby="next-label">
              <XaLabel id="next-label">What happens next</XaLabel>
              <XaAnswers labelWidth={112} rows={[
                ["This week", "Strelva keeps your site and Google listing healthy. Nothing for you to do."],
                ["First recap", "In about a week, here: who found you and what changed."],
                ["Any time", "Ask Strelva in plain words. Bigger changes wait here on Home for your yes."],
              ]} />
            </section>
          ) : (
            <ActivityFeed activity={strelvaWork} historyHref={hrefs.history} limit={4} now={props.now} />
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
