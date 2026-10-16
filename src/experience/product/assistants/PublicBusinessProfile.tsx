import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { XaAnswers, XaButtonLink, XaEmpty, XaHeadline, XaLabel, XaLede, XaMark, XaPebbleAvatar, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import type { PublicFacts } from "@/products/connected-sites/contracts";
import { formatAddress, mapsUrl, weeklyHours } from "@/products/connected-sites";
import { publishedPolicyRows } from "@/products/connected-sites";
import { BusinessEvidence } from "@/products/connected-sites";
import styles from "./assistants.module.css";

export interface ProfileFact { label: string; value: string; source: string; detail?: string }
export interface ProfileCapability { label: string; detail: string; method: string }
export type AssistantViewState = "ready" | "loading" | "empty" | "error" | "permission";

/** "Monday to Friday: 8 AM – 5 PM · Sat: 9 AM – 1 PM · Sun: Closed": consecutive days with the same hours read as one. */
function groupedHours(rows: ReturnType<typeof weeklyHours>): string {
  const groups: { first: string; last: string; hours: string }[] = [];
  for (const row of rows) {
    const short = row.label;
    const previous = groups[groups.length - 1];
    if (previous && previous.hours === row.hours) previous.last = short;
    else groups.push({ first: short, last: short, hours: row.hours });
  }
  return groups.map(group => `${group.first === group.last ? group.first : `${group.first} to ${group.last}`}: ${group.hours}`).join(" · ");
}

const day = (iso: string, month: "short" | "long" = "short") => new Date(iso).toLocaleDateString("en-US", { month, day: "numeric", ...(month === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });

/**
 * The public business page (/biz/[handle]) in XA (xs-visitor, October 16).
 * One reading column about the business: who it is, how to reach it, then its
 * confirmed facts as plain answers, each source said once in words, never in
 * mono on every row. What an assistant may do sits beside it, quieter.
 * Capability rows require an explicit projection; a published facts page
 * alone grants no action.
 */
export function PublicBusinessProfile({ facts, confirmedAt, pageUrl, factRows, capabilities, endpoint, state = "ready", fictional = false }: {
  facts: PublicFacts; confirmedAt: string | null; pageUrl: string;
  factRows?: ProfileFact[]; capabilities?: ProfileCapability[]; endpoint?: string;
  state?: AssistantViewState; fictional?: boolean;
}) {
  const hours = weeklyHours(facts);
  const policies = publishedPolicyRows(facts.policies);
  const source = "Published business record";
  const rows: ProfileFact[] = factRows ?? [
    ...(hours.length ? [{ label: "Hours", value: groupedHours(hours), source }] : []),
    ...(facts.services?.length ? [{ label: "Services", value: facts.services.map(service => service.name).join(" · "), detail: facts.services.filter(service => service.description).map(service => `${service.name}: ${service.description}`).join(" · "), source }] : []),
    ...(facts.services?.some(service => service.priceText) ? [{ label: "Fees", value: facts.services.filter(service => service.priceText).map(service => `${service.name}: ${service.priceText}`).join(" · "), source }] : []),
    ...(facts.service_area?.length ? [{ label: "Service area", value: facts.service_area.join(" · "), source }] : []),
  ];
  const sources = [...new Set(rows.map(row => row.source))];
  const domain = facts.verification?.domain;
  const place = facts.address?.locality ? [facts.address.locality, facts.address.region].filter(Boolean).join(", ") : null;
  const reach = [
    facts.phone ? { label: "Call", value: facts.phone, href: `tel:${facts.phone.replace(/[^0-9+]/g, "")}` } : null,
    facts.email ? { label: "Email", value: facts.email, href: `mailto:${facts.email}` } : null,
    facts.address ? { label: "Visit", value: formatAddress(facts.address), href: mapsUrl(facts.address) } : null,
  ].filter((item): item is { label: string; value: string; href: string } => item !== null);
  const withheld = state === "error" || state === "permission";

  return <div data-workspace-theme="linen" className={styles.publicRoot}>
    <header className={styles.publicHeader}>
      <Link href="/" aria-label="Strelva home" className={styles.brand}><XaMark size={24} /><span>Strelva</span></Link>
      <XaTextLink href="#about-this-page">What is this page?</XaTextLink>
    </header>
    <main className={styles.profile}>
      {fictional ? <p className={styles.fixture}>Fictional business and permissions. This preview makes no live calls.</p> : null}

      {state === "loading" ? <div className={styles.loading} role="status" aria-label="Loading business details">
        <span data-size="sm" /><span data-size="lg" /><span data-size="md" /><span /><span />
      </div> : withheld ? <div className={styles.withheld} role="alert">
        <XaPebbleAvatar size={32} />
        <p>{state === "permission" ? "This business page is unavailable. Only published details can be read here." : "This business page couldn't load. Nothing about the business changed; open the page again in a minute."}</p>
      </div> : <div className={styles.profileColumns}>
        <div className={styles.stack}>
          <p className={styles.evidenceLine} data-confirmed={domain?.verified || undefined}>
            {domain?.verified ? <BadgeCheck size={16} aria-hidden="true" /> : null}
            <span>{domain?.verified ? `Domain control confirmed · ${domain.url}` : "Published business record"}</span>
          </p>
          <div>
            <XaHeadline size="lg" quiet={place ? `in ${place}` : undefined}>{facts.name || "Business profile"}</XaHeadline>
            {facts.description ? <XaLede>{facts.description}</XaLede> : null}
          </div>

          {facts.booking_url || reach.length ? <div className={styles.reach}>
            {facts.booking_url ? <XaButtonLink href={facts.booking_url} variant="primary" size="lg">Book a time</XaButtonLink> : null}
            {reach.map(item => <a key={item.label} href={item.href} className={styles.reachLink}><span className={styles.reachVerb}>{item.label}</span>{item.value}</a>)}
          </div> : null}

          {state === "empty" || !rows.length ? <XaEmpty pose="alone" size="sm" title="No public business details have been confirmed yet." job="Waiting for the business to confirm its hours and services">
            Assistants reading this page will say they don&apos;t know rather than guess.
          </XaEmpty> : <section aria-labelledby="facts-title" className={styles.factBlock}>
            <XaLabel as="h2" id="facts-title">What {facts.name || "the business"} has confirmed</XaLabel>
            <XaAnswers labelWidth={132} rows={rows.map(row => [row.label, <span key={row.label} className={styles.answer}>{row.value}{row.detail ? <span className={styles.answerDetail}>{row.detail}</span> : null}</span>] as const)} />
            <p className={styles.muted}>Source: {sources.join(" · ")}{confirmedAt && !fictional ? `. Updated ${day(confirmedAt, "long")}` : ""}</p>
          </section>}

          {policies.length ? <section aria-labelledby="policies-title" className={styles.factBlock}>
            <XaLabel as="h2" id="policies-title">Business policies</XaLabel>
            <XaAnswers labelWidth={132} rows={policies.map(policy => {
              const provenance = facts.policies?.[policy.key as keyof NonNullable<PublicFacts["policies"]>];
              return [policy.label, <span key={policy.key} className={styles.answer}>{policy.text}<span className={styles.answerDetail}>{provenance?.source === "owner" ? "Owner confirmed" : "Strelva confirmed"}{provenance?.updatedAt ? ` · ${day(provenance.updatedAt)}` : ""}</span></span>] as const;
            })} />
            <p className={styles.muted}>These terms describe business policy. They do not establish booking enforcement or charging.</p>
          </section> : null}

          {facts.verification && !fictional ? <section aria-labelledby="evidence-title" className={styles.factBlock}>
            <XaLabel as="h2" id="evidence-title">How this page is checked</XaLabel>
            <BusinessEvidence verification={facts.verification} />
          </section> : null}
        </div>

        <aside className={styles.aside} aria-labelledby="assistants-title">
          <XaLabel as="h2" id="assistants-title">For assistants</XaLabel>
          {capabilities?.length && state !== "empty" ? <XaRows label="What an assistant can do here">
            {capabilities.map(capability => <XaRow key={capability.label} title={capability.label} detail={capability.detail} meta={capability.method} />)}
          </XaRows> : <p className={styles.asideText}>An assistant can read the details on this page. Nothing else is offered here.</p>}
          {endpoint && state !== "empty" ? <p className={styles.asideText}>Connect over MCP at <span className={styles.endpoint}>{endpoint}</span></p> : null}
          <p className={styles.asideText}>Assistants cannot pay, cancel or change anything here.</p>
          {!fictional ? <XaTextLink href={`${pageUrl}/llms.txt`}>Fact sheet for assistants</XaTextLink> : null}
        </aside>
      </div>}

      <section id="about-this-page" className={styles.about}>
        <XaLabel as="h2">About this page</XaLabel>
        <p>Strelva publishes the details {withheld ? "a business" : facts.name || "a business"} has confirmed, with where each came from. A missing detail is unknown, and assistants should never guess it.</p>
        {state === "ready" && facts.social_links?.length ? <XaRows label="Elsewhere online">{facts.social_links.map(link => <XaRow key={link} title={link} href={link} />)}</XaRows> : null}
      </section>
    </main>
  </div>;
}
