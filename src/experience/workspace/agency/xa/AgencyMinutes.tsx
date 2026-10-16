"use client";
/**
 * XA · AG6 · Minutes this month (Pen XAg65).
 *
 * The figure is the screen: minutes the agency's people logged per client
 * this month, with what the time went to in their own notes. Strelva's own
 * work is not counted here and the page says so. Time is logged inside each
 * client (the Care plan time entry); this page only reads it.
 */
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaEmpty, XaHeadline, XaInitial, XaLabel, XaPebbleScene, XaRow, XaRows, XaSays } from "@/components/ui/strelva/Xa";
import { minutesHeadline } from "./agency-xa-model";
import { clientColor } from "./client-color";
import { MINUTES_CLIENT_LIMIT, type AgencyMinutesState } from "./useAgencyMinutes";
import styles from "./agency-xa.module.css";

export interface AgencyMinutesProps {
  agencyName: string;
  state: AgencyMinutesState | { status: "clients-error" };
  now?: Date;
  onOpenClient: (workspaceId: string) => void;
  onRetry: () => void;
}

export function AgencyMinutes({ agencyName, state, now = new Date(), onOpenClient, onRetry }: AgencyMinutesProps) {
  if (state.status === "loading" || state.status === "idle") return <div className={styles.minutes} role="status" aria-label="Adding up this month's minutes">
    <div className={styles.minutesLead}><XaHeadline>Adding up this month…</XaHeadline><div className={styles.skeletonRows}>{[86, 72, 80, 60].map(width => <StSkeleton key={width} width={`${width}%`} />)}</div></div>
  </div>;

  if (state.status === "off") return <div className={styles.state}>
    <XaEmpty pose="resting" job="Pebble starts counting the day time logging is turned on for your agency." title="Minutes aren't on for your agency yet.">
      When they are, each person at {agencyName} logs time inside a client and it adds up here, by client, for the month.
    </XaEmpty>
  </div>;

  if (state.status === "error" || state.status === "clients-error") return <div className={styles.state}>
    <XaEmpty pose="fixing" job="Pebble kept every entry as it was. Nothing was lost." title="This month's minutes didn't load." action={<XaButton variant="primary" onClick={onRetry}>Try again</XaButton>} />
  </div>;

  const { line, quiet } = minutesHeadline(state.rows, now);
  const counted = state.rows.filter(row => row.minutes > 0);
  const zero = state.rows.filter(row => row.minutes === 0);

  return <div className={styles.minutes}>
    <div className={styles.minutesLead}>
      <XaHeadline quiet={quiet}>{line}</XaHeadline>
      <p className={styles.note}>Logged when someone at {agencyName} works on a client. Strelva&apos;s own work isn&apos;t counted here.</p>
      {counted.length ? <XaRows label="Minutes by client this month">
        {counted.map(row => <XaRow key={row.workspaceId} lead={<XaInitial name={row.name} color={clientColor(row.workspaceId)} size={32} />} title={row.name}
          detail={row.notes.length ? row.notes.slice(0, 3).join(", ") : `Logged by ${row.people.join(" and ")}`}
          meta={<span className={styles.figure}>{row.minutes}<small>min</small></span>} onClick={() => onOpenClient(row.workspaceId)} />)}
      </XaRows> : <XaEmpty pose="resting" size="sm" job="Pebble adds up time as soon as someone logs it inside a client." title="Nothing logged yet this month." />}
      {zero.length && counted.length ? <p className={styles.note}>No time logged for {zero.length === 1 ? zero[0]!.name : `${zero.length} other clients`} this month.</p> : null}
      {state.failed.length ? <p role="alert" className={styles.inlineAlert}>Time for {state.failed.join(", ")} could not be read, so it isn&apos;t in the total.</p> : null}
      {state.partial ? <p className={styles.note}>Counted for your first {MINUTES_CLIENT_LIMIT} clients.</p> : null}
    </div>
    <aside className={styles.minutesSide} aria-label="Who did the work">
      <XaPebbleScene pose="lineup" size={260} label="Pebble with every System lined up" />
      <XaLabel as="h2">Strelva&apos;s own work</XaLabel>
      <XaSays>What Strelva does for your clients is named as Strelva wherever it appears, and never added to your time.</XaSays>
    </aside>
  </div>;
}
