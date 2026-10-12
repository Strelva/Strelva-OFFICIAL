"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { AppWindow, CalendarDays, FileText, Globe2, Inbox, Mail, MapPin, Sheet, UserPlus, type LucideIcon } from "lucide-react";
import { HEALTH_LABEL, LIFECYCLE_LABEL, SYSTEM_KIND_LABEL, type SystemHealth, type SystemKind, type SystemLifecycle, type SystemView } from "./model";
import styles from "./systems.module.css";

export const SYSTEM_ICONS: Record<SystemKind, LucideIcon> = {
  website: Globe2, inquiries: Inbox, bookings: CalendarDays, document: FileText, app: AppWindow, tracker: Sheet, onboarding: UserPlus,
  listing: MapPin, newsletter: Mail, home_finder: MapPin,
};

export function LifecyclePill({ lifecycle }: { lifecycle: SystemLifecycle }) {
  return <span className={styles.lifecycle} data-lifecycle={lifecycle}>{LIFECYCLE_LABEL[lifecycle]}</span>;
}

export function HealthSignal({ health, detailed = false }: { health: SystemHealth; detailed?: boolean }) {
  return <span className={styles.health} data-health={health.state} title={health.summary}>{detailed ? `${HEALTH_LABEL[health.state]}. ${health.summary}` : HEALTH_LABEL[health.state]}</span>;
}

/** The business's actual Systems, each with lifecycle and a separate health signal. */
export function SystemList({ systems, href, onOpen, label }: { systems: readonly SystemView[]; href: (id: string) => string; onOpen?: (id: string) => void; label: string }) {
  function open(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(id);
  }
  return <ul className={styles.grid} aria-label={label}>
    {systems.map(system => {
      const Icon = SYSTEM_ICONS[system.kind];
      const ready = system.possibilities.filter(item => item.status === "ready").length;
      const exploring = system.possibilities.length - ready;
      return <li key={system.id}>
        <Link className={styles.card} href={href(system.id)} onClick={event => open(event, system.id)} aria-label={`Open ${system.name}, ${SYSTEM_KIND_LABEL[system.kind]}, ${LIFECYCLE_LABEL[system.lifecycle]}, ${HEALTH_LABEL[system.health.state]}`}>
          <span className={styles.cardTop}><span><Icon size={16} aria-hidden="true" />{SYSTEM_KIND_LABEL[system.kind]}</span><LifecyclePill lifecycle={system.lifecycle} /></span>
          <span><strong>{system.name}</strong>{system.detail ? <small>{system.detail}</small> : null}</span>
          <span className={styles.cardFoot}>
            <HealthSignal health={system.health} />
            {ready ? <span className={styles.hint}>{ready} {ready === 1 ? "possibility" : "possibilities"} ready</span> : exploring ? <span className={styles.hint}>{exploring} being explored</span> : null}
            {system.versions.length ? <span className={styles.hint}>{system.versions.length} {system.versions.length === 1 ? "version" : "versions"}</span> : null}
          </span>
        </Link>
      </li>;
    })}
  </ul>;
}
