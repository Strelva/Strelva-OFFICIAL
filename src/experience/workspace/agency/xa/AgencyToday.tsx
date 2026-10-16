"use client";
/**
 * XA · AG1 · Today, every client in one read (Pen I2nCa).
 *
 * One dominant thing: the composer carrying the one item that needs the
 * agency. Below it, one row per client saying where it stands and the time
 * logged this month. Pebble sits on the right with the latest checks, fixing
 * when something is broken. Data is the agency's own batched client read.
 */
import { useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaButtonLink, XaComposer, XaEmpty, XaHeadline, XaInitial, XaLabel, XaLede, XaMark, XaPebbleScene, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import type { AgencyClientRow, AgencyQueueItem } from "../../agency-clients";
import { clientStanding, greeting, problemSystems, queueActionLabel, splitQueue, todaySentence } from "./agency-xa-model";
import { clientColor } from "./client-color";
import styles from "./agency-xa.module.css";

const ROWS_SHOWN = 8;

export interface AgencyTodayProps {
  agencyName: string;
  personName: string | null;
  status: "loading" | "error" | "ready";
  clients: readonly AgencyClientRow[];
  queue: readonly AgencyQueueItem[];
  /** Minutes logged this month per client, when the time read is on. */
  minutes?: ReadonlyMap<string, number> | null;
  totalClients?: number;
  addClientHref: string;
  /** The viewer's local hour, for the greeting. */
  hour: number;
  onAsk: (text: string) => void;
  onOpenClient: (workspaceId: string) => void;
  onOpenItem: (item: AgencyQueueItem) => void;
  onAllClients?: () => void;
  onRetry: () => void;
}

export function AgencyToday({ agencyName, personName, status, clients, queue, minutes, totalClients, addClientHref, hour, onAsk, onOpenClient, onOpenItem, onAllClients, onRetry }: AgencyTodayProps) {
  const [ask, setAsk] = useState("");
  const hello = `${greeting(hour)}${personName ? `, ${personName}` : ""}.`;

  if (status === "loading") return <div className={styles.today} aria-busy="true">
    <div className={styles.todayLead} role="status" aria-label="Reading every client">
      <XaMark size={40} />
      <XaHeadline size="lg">{hello}</XaHeadline>
      <XaLede>Reading every client…</XaLede>
      <div className={styles.skeletonRows}>{[92, 76, 84, 64].map(width => <StSkeleton key={width} width={`${width}%`} />)}</div>
    </div>
  </div>;

  if (status === "error") return <div className={styles.state}>
    <XaEmpty pose="fixing" job="Pebble kept everything as it was. Access has not changed." title="Your clients didn't load." action={<XaButton variant="primary" onClick={onRetry}>Try again</XaButton>}>
      Strelva couldn&apos;t read {agencyName}&apos;s clients just now.
    </XaEmpty>
  </div>;

  if (!clients.length) return <div className={styles.state}>
    <XaEmpty pose="waving" job="Pebble reads a new client's website first and shows you what it found." title={`${hello} Add your first client.`} action={<XaButtonLink variant="primary" href={addClientHref}>Add a client</XaButtonLink>}>
      Each client keeps its own Systems, records and owner. {agencyName} works inside what the owner allows.
    </XaEmpty>
  </div>;

  const { you } = splitQueue(queue);
  const first = you[0];
  const problems = clients.flatMap(client => problemSystems(client).map(system => ({ client, system })));
  const checked = clients.reduce((sum, client) => sum + client.systems.filter(system => system.health?.status === "healthy").length, 0);
  const shown = clients.slice(0, ROWS_SHOWN);
  const more = (totalClients ?? clients.length) - shown.length;

  return <div className={styles.today}>
    <div className={styles.todayLead}>
      <XaMark size={40} />
      <div className={styles.greeting}>
        <XaHeadline size="lg">{hello}</XaHeadline>
        <XaLede>{todaySentence(clients, queue)}</XaLede>
      </div>
      <XaComposer value={ask} onChange={setAsk} onSubmit={() => { onAsk(ask); setAsk(""); }} placeholder="Ask Strelva for anything" inputLabel={`Ask Strelva about ${agencyName}'s clients`}
        scope={{ label: "All clients", state: "live" }}
        waiting={first ? {
          kicker: `${first.clientName} · needs you`,
          title: first.title,
          from: { name: first.clientName, color: clientColor(first.workspaceId) },
          action: <XaButton size="sm" onClick={() => onOpenItem(first)}>{queueActionLabel(first)}</XaButton>,
        } : undefined} />
      <section aria-labelledby="agency-today-clients">
        <XaLabel id="agency-today-clients" as="h2">Clients{minutes ? " · time this month" : ""}</XaLabel>
        <XaRows label="Clients">
          {shown.map(client => {
            const { standing, line } = clientStanding(client, queue);
            const time = minutes?.get(client.workspaceId);
            return <XaRow key={client.workspaceId} lead={<XaInitial name={client.name} color={clientColor(client.workspaceId)} />} title={client.name}
              detail={line} tone={standing === "needs-you" || standing === "broken" || standing === "unread" ? "waits" : undefined}
              meta={time !== undefined ? `${time} min` : undefined} onClick={() => onOpenClient(client.workspaceId)} />;
          })}
        </XaRows>
        {more > 0 && onAllClients ? <p className={styles.note}><XaTextLink onClick={onAllClients}>All {totalClients ?? clients.length} clients</XaTextLink></p> : null}
      </section>
    </div>
    <aside className={styles.todaySide} aria-label="What Strelva checked">
      <XaPebbleScene pose={problems.length ? "fixing" : "resting"} size={300} label={problems.length ? "Pebble working on what broke" : "Pebble resting beside the calendar"} />
      <div className={styles.checks}>
        <XaLabel as="h2">{problems.length ? `Pebble is watching ${problems.length === 1 ? "one System" : `${problems.length} Systems`} that broke` : "Latest checks"}</XaLabel>
        <ul className={styles.checkList}>
          {problems.slice(0, 4).map(({ client, system }) => <li key={system.id}><CircleAlert size={15} color="var(--st-need-dot)" aria-hidden="true" /><span>{system.name} at {client.name}<small>{system.health?.summary || "Not working"}</small></span></li>)}
          {checked ? <li><Check size={15} color="var(--st-text-3)" aria-hidden="true" /><span>{problems.length ? `Everything else passed its last check (${checked} ${checked === 1 ? "System" : "Systems"}).` : `${checked} ${checked === 1 ? "System" : "Systems"} passed their last check.`}</span></li>
            : !problems.length ? <li><Check size={15} color="var(--st-text-3)" aria-hidden="true" /><span>No checks have run on shared Systems yet.</span></li> : null}
        </ul>
      </div>
    </aside>
  </div>;
}
