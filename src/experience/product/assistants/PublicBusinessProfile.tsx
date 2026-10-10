import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { StEmpty, StHead, StLabel, StMono, StNotice, StPage, StPillLink, StRow, StRows, StSection, StSkeleton, StTextButton } from "@/components/ui/strelva/Kit";
import type { PublicFacts } from "@/products/connected-sites/contracts";
import { formatAddress, mapsUrl, weeklyHours } from "@/products/connected-sites/business-page";
import { publishedPolicyRows } from "@/products/connected-sites/published-policies";
import { BusinessEvidence } from "@/products/connected-sites/BusinessEvidence";
import styles from "./assistants.module.css";

export interface ProfileFact { label: string; value: string; source: string; detail?: string }
export interface ProfileCapability { label: string; detail: string; method: string }
export type AssistantViewState = "ready" | "loading" | "empty" | "error" | "permission";

/** Shared presentation. Capability rows require an explicit projection; a published facts page alone grants no action. */
export function PublicBusinessProfile({ facts, confirmedAt, pageUrl, factRows, capabilities, endpoint, state = "ready", fictional = false }: {
  facts: PublicFacts; confirmedAt: string | null; pageUrl: string;
  factRows?: ProfileFact[]; capabilities?: ProfileCapability[]; endpoint?: string;
  state?: AssistantViewState; fictional?: boolean;
}) {
  const confirmed = confirmedAt ? new Date(confirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
  const source = "Published business record";
  const hours = weeklyHours(facts);
  const policies = publishedPolicyRows(facts.policies);
  const rows: ProfileFact[] = factRows ?? [
    ...(hours.length ? [{ label: "Hours", value: hours.map(row => `${row.label}: ${row.hours}`).join(" · "), source }] : []),
    ...(facts.services?.length ? [{ label: "Services", value: facts.services.map(service => service.name).join(" · "), detail: facts.services.filter(service => service.description).map(service => `${service.name}: ${service.description}`).join(" · "), source }] : []),
    ...(facts.services?.some(service => service.priceText) ? [{ label: "Fees", value: facts.services.filter(service => service.priceText).map(service => `${service.name}: ${service.priceText}`).join(" · "), source }] : []),
    ...(facts.service_area?.length ? [{ label: "Service area", value: facts.service_area.join(" · "), source }] : []),
  ];
  const domain = facts.verification?.domain;
  return <div data-workspace-theme="linen" className={styles.publicRoot}>
    <header className={styles.publicHeader}><Link href="/" aria-label="Strelva home" className={styles.brand}><LogoMark className="size-6" /><span>Strelva</span></Link><StTextButton href="#about-this-page">What is this page?</StTextButton></header>
    <main><StPage width="wide">
      {fictional ? <p className={styles.fixture}>Fictional business and permissions. This preview makes no live calls.</p> : null}
      {state === "loading" ? <div className={styles.stack}><StSkeleton width="60%" label="Loading business details" /><StSkeleton /><StSkeleton width="80%" /></div> : state === "error" || state === "permission" ? <StNotice tone="critical">{state === "permission" ? "This business profile is unavailable. Only published details can be read here." : "The business profile could not be loaded. Try opening this page again."}</StNotice> : <div className={styles.profileColumns}>
        <div className={styles.stack}>
          <p className={styles.evidenceLine}>{domain?.verified ? <BadgeCheck size={15} aria-hidden="true" /> : null}{domain?.verified ? <>Domain control confirmed · {domain.url}{confirmed ? ` · business confirmed ${confirmed}` : ""}</> : <>Published business record{confirmed ? ` · latest update ${confirmed}` : ""}</>}</p>
          <StHead title={facts.name || "Business profile"} meta={facts.description} />
          {state === "empty" || !rows.length ? <StEmpty>No public business details have been confirmed yet.</StEmpty> : <StRows label="Confirmed business facts">{rows.map(row => <StRow key={row.label} lead={<span className={styles.factLabel}>{row.label}</span>} title={row.value} detail={row.detail} end={<StMono>{row.source}</StMono>} />)}</StRows>}
          {policies.length ? <StSection title="Business policies"><StRows>{policies.map(policy => {
            const provenance = facts.policies?.[policy.key as keyof NonNullable<PublicFacts["policies"]>];
            return <StRow key={policy.key} kind={policy.label} title={policy.text} end={<StMono>{provenance?.source === "owner" ? "Owner confirmed" : "Strelva confirmed"}{provenance?.updatedAt ? ` · ${new Date(provenance.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}</StMono>} />;
          })}</StRows><p className={styles.muted}>These terms describe business policy. They do not establish booking enforcement or charging.</p></StSection> : null}
          {facts.phone || facts.email || facts.address || facts.booking_url ? <StSection title="Contact"><StRows>
            {facts.phone ? <StRow kind="Phone" title={facts.phone} href={`tel:${facts.phone.replace(/[^0-9+]/g, "")}`} /> : null}
            {facts.email ? <StRow kind="Email" title={facts.email} href={`mailto:${facts.email}`} /> : null}
            {facts.address ? <StRow kind="Address" title={formatAddress(facts.address)} href={mapsUrl(facts.address)} /> : null}
          </StRows>{facts.booking_url ? <div><StPillLink href={facts.booking_url}>Book a time</StPillLink></div> : null}</StSection> : null}
          {facts.verification && !fictional ? <StSection title="Business evidence"><BusinessEvidence verification={facts.verification} /></StSection> : null}
        </div>
        <aside className={styles.stack} aria-label="Assistant access">
          <StSection title="What an assistant can do here">
            {capabilities?.length && state !== "empty" ? <StRows>{capabilities.map(capability => <StRow key={capability.label} title={capability.label} detail={capability.detail} end={<StMono>{capability.method}</StMono>} />)}</StRows> : <StEmpty>Read the business details on this page. Other permissions are not shown on this page.</StEmpty>}
            {endpoint && state !== "empty" ? <p className={styles.endpoint}><StMono>Connect over MCP: {endpoint}</StMono></p> : null}
            <p className={styles.muted}>Assistants cannot pay, cancel or change anything here.</p>
          </StSection>
          {!fictional ? <StTextButton href={`${pageUrl}/llms.txt`}>Fact sheet for assistants</StTextButton> : null}
        </aside>
      </div>}
      {state === "ready" && confirmedAt && !fictional ? <p className={styles.muted}>Updated {new Date(confirmedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p> : null}
      <section id="about-this-page" className={styles.about}><StLabel>About this page</StLabel><p>Published business details, with their source. Missing details are unknown; assistants should never guess them.</p>{state === "ready" && facts.social_links?.length ? <StRows label="Elsewhere online">{facts.social_links.map(link => <StRow key={link} title={link} href={link} />)}</StRows> : null}</section>
    </StPage></main>
  </div>;
}
