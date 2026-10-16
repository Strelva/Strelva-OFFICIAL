import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { XaButtonLink, XaEmpty, XaHeadline, XaLabel, XaLede, XaMark, XaPebbleAvatar, XaRow, XaRows, XaTextLink } from "@/components/ui/strelva/Xa";
import type { PublicFacts } from "@/products/connected-sites/contracts";
import { formatAddress, mapsUrl, weeklyHours } from "@/products/connected-sites";
import { publishedPolicyRows } from "@/products/connected-sites";
import styles from "./assistants.module.css";

export interface ProfileFact { label: string; value: string; source: string; detail?: string }
export interface ProfileCapability { label: string; detail: string; method: string }
export type AssistantViewState = "ready" | "loading" | "empty" | "error" | "permission";

/** Every date on the page reads one way: "Oct 12, 2026". */
const day = (iso: string) => {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
};

/** "Mon–Fri 8 AM–5 PM": consecutive days with the same hours read as one row, times with a closed en dash. */
function hourRows(rows: ReturnType<typeof weeklyHours>): { days: string; hours: string }[] {
  const groups: { first: string; last: string; hours: string }[] = [];
  for (const row of rows) {
    const short = row.label.slice(0, 3);
    const hours = row.hours.replace(/ – /g, "–");
    const previous = groups[groups.length - 1];
    if (previous && previous.hours === hours) previous.last = short;
    else groups.push({ first: short, last: short, hours });
  }
  return groups.map(group => ({ days: group.first === group.last ? group.first : `${group.first}–${group.last}`, hours: group.hours }));
}

/** "A, B and C". */
const list = (items: readonly string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The public business page (/biz/[handle]) in XA (xs-visitor, October 16).
 * The dominant object is how to reach the business: its hours, one primary
 * "Book a time", then call, email and visit stacked under it. Beside it, who
 * the business is and what it does, each service with its length and price in
 * place. How the page is checked is one sourced sentence, never a table of
 * provider states. What an assistant may do sits at the bottom, quieter.
 * Capability rows require an explicit projection; a published facts page
 * alone grants no action.
 */
export function PublicBusinessProfile({ facts, confirmedAt, pageUrl, factRows, capabilities, endpoint, state = "ready", fictional = false }: {
  facts: PublicFacts; confirmedAt: string | null; pageUrl: string;
  factRows?: ProfileFact[]; capabilities?: ProfileCapability[]; endpoint?: string;
  state?: AssistantViewState; fictional?: boolean;
}) {
  const name = facts.name || "This business";
  const hours = hourRows(weeklyHours(facts));
  const policies = publishedPolicyRows(facts.policies);
  const services = facts.services ?? [];
  const domain = facts.verification?.domain;
  const google = facts.verification?.googleBusinessProfile;
  const agencies = facts.verification?.operatingAgencies.map(agency => agency.name).filter(Boolean) ?? [];
  const confirmed = facts.verification?.lastConfirmedAt ?? confirmedAt;
  const place = facts.address?.locality ? [facts.address.locality, facts.address.region].filter(Boolean).join(", ") : null;
  const reach = [
    facts.phone ? { label: "Call", value: facts.phone, href: `tel:${facts.phone.replace(/[^0-9+]/g, "")}` } : null,
    facts.email ? { label: "Email", value: facts.email, href: `mailto:${facts.email}` } : null,
    facts.address ? { label: "Visit", value: formatAddress(facts.address), href: mapsUrl(facts.address) } : null,
  ].filter((item): item is { label: string; value: string; href: string } => item !== null);
  const withheld = state === "error" || state === "permission";
  const nothingConfirmed = state === "empty" || (!factRows?.length && !hours.length && !services.length && !facts.service_area?.length);
  // How this page is checked, said once in plain words with its sources.
  const checked = [
    confirmed && !fictional ? `${name} confirmed these details on ${day(confirmed)}.` : null,
    google?.verified ? "Google has checked its listing." : google?.linked ? "Its Google listing is linked, but Google hasn't checked it yet." : null,
    agencies.length ? `${list(agencies)} keeps this page up to date for ${name}.` : null,
  ].filter(Boolean).join(" ");
  const social = (facts.social_links ?? []).map(link => ({ link, label: socialLabel(link) }));

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
      </div> : <>
        <div className={styles.identity}>
          {domain?.verified && domain.url ? <p className={styles.evidenceLine} data-confirmed>
            <BadgeCheck size={16} aria-hidden="true" /><span>{name} owns {domain.url}</span>
          </p> : null}
          <XaHeadline size="lg" quiet={place ? `in ${place}` : undefined}>{facts.name || "Business profile"}</XaHeadline>
          {facts.description ? <XaLede>{facts.description}</XaLede> : null}
        </div>
        <div className={styles.profileColumns}>
          <div className={styles.stack}>

            {nothingConfirmed ? <XaEmpty pose="alone" size="sm" title="No public business details have been confirmed yet." job="Waiting for the business to confirm its hours and services">
              Assistants reading this page will say they don&apos;t know rather than guess.
            </XaEmpty> : <>
              {services.length ? <section aria-labelledby="services-title" className={styles.factBlock}>
                <XaLabel as="h2" id="services-title">What {name} does</XaLabel>
                <ul className={styles.services}>
                  {services.map(service => <li key={service.name} className={styles.service}>
                    <span className={styles.serviceName}>{service.name}</span>
                    {service.priceText ? <span className={styles.servicePrice}>{service.priceText}</span> : null}
                    {service.description ? <span className={styles.serviceDetail}>{service.description}</span> : null}
                  </li>)}
                </ul>
                {facts.service_area?.length ? <p className={styles.muted}>Serves {list(facts.service_area)}.</p> : null}
              </section> : facts.service_area?.length ? <p className={styles.muted}>Serves {list(facts.service_area)}.</p> : null}

              {factRows?.length ? <section aria-labelledby="facts-title" className={styles.factBlock}>
                <XaLabel as="h2" id="facts-title">What {name} has confirmed</XaLabel>
                <ul className={styles.services}>{factRows.map(row => <li key={row.label} className={styles.service}>
                  <span className={styles.serviceName}>{row.label}</span><span className={styles.serviceDetail}>{row.value}{row.detail ? ` ${row.detail}` : ""}</span>
                </li>)}</ul>
              </section> : null}
            </>}

            {policies.length ? <section aria-labelledby="policies-title" className={styles.factBlock}>
              <XaLabel as="h2" id="policies-title">Before you book</XaLabel>
              <ul className={styles.services}>{policies.map(policy => {
                const provenance = facts.policies?.[policy.key as keyof NonNullable<PublicFacts["policies"]>];
                const who = provenance?.source === "owner" ? name : "Strelva";
                return <li key={policy.key} className={styles.service}>
                  <span className={styles.serviceName}>{policy.label}</span>
                  <span className={styles.serviceDetail}>{policy.text}{provenance?.updatedAt ? ` ${who} confirmed this on ${day(provenance.updatedAt)}.` : ""}</span>
                </li>;
              })}</ul>
            </section> : null}
          </div>

          {/* The page's one dominant object: when it is open and how to get in touch. */}
          {facts.booking_url || reach.length || hours.length ? <aside className={styles.reachPanel} aria-labelledby="reach-title">
            <h2 id="reach-title" className={styles.reachTitle}>{hours.length ? "Hours" : `Reach ${name}`}</h2>
            {hours.length ? <dl className={styles.hours}>{hours.map(row => <div key={row.days} className={styles.hoursRow}><dt>{row.days}</dt><dd>{row.hours}</dd></div>)}</dl> : null}
            {facts.booking_url ? <XaButtonLink href={facts.booking_url} variant="primary" size="lg" block>Book a time</XaButtonLink> : null}
            {reach.length ? <ul className={styles.reachList}>
              {reach.map(item => <li key={item.label}><a href={item.href} className={styles.reachLink}><span className={styles.reachVerb}>{item.label}</span>{item.value}</a></li>)}
            </ul> : null}
          </aside> : null}
        </div>

        {checked ? <p className={styles.checked}>{checked}</p> : null}
      </>}

      {!withheld && state !== "loading" ? <section aria-labelledby="assistants-title" className={styles.assistants}>
        <XaLabel as="h2" id="assistants-title">For assistants</XaLabel>
        {capabilities?.length && state !== "empty" ? <XaRows label="What an assistant can do here">
          {capabilities.map(capability => <XaRow key={capability.label} title={capability.label} detail={capability.detail} />)}
        </XaRows> : <p className={styles.asideText}>An assistant can read the details on this page. Nothing else is offered here.</p>}
        <p className={styles.asideText}>Assistants cannot pay, cancel or change anything here.{endpoint && state !== "empty" ? <> Assistants connect at <span className={styles.endpoint}>{endpoint}</span>.</> : null}</p>
        {!fictional ? <XaTextLink href={`${pageUrl}/llms.txt`}>Fact sheet for assistants</XaTextLink> : null}
      </section> : null}

      <section id="about-this-page" className={styles.about}>
        <XaLabel as="h2">About this page</XaLabel>
        <p>Strelva publishes the details {withheld ? "a business" : facts.name || "a business"} has confirmed, with where each came from. A missing detail is unknown, and assistants should never guess it.</p>
        {state === "ready" && social.length ? <p className={styles.elsewhere}>Also on {social.map((item, index) => <span key={item.link}>{index ? ", " : ""}<a href={item.link} rel="noopener noreferrer">{item.label}</a></span>)}</p> : null}
      </section>
    </main>
  </div>;
}

/** A social profile by its site's name ("Instagram"), never the raw address. */
function socialLabel(link: string): string {
  let host = "";
  try { host = new URL(link).hostname.replace(/^www\./, ""); } catch { return "Their profile"; }
  const known: Record<string, string> = { "instagram.com": "Instagram", "facebook.com": "Facebook", "tiktok.com": "TikTok", "linkedin.com": "LinkedIn", "x.com": "X", "twitter.com": "X", "youtube.com": "YouTube", "yelp.com": "Yelp", "pinterest.com": "Pinterest", "threads.net": "Threads" };
  return known[host] ?? host;
}
