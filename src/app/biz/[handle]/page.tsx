/**
 * The public business page (#309): a business's confirmed facts, rendered on
 * the server with its schema.org JSON-LD in the HTML, so AI crawlers that
 * never run JavaScript read the same answer people do. No client component:
 * the page ships no JavaScript of its own.
 *
 * App host only (a client site's host answers 404, so no business's page
 * appears under another's domain). Off unless STRELVA_BUSINESS_PAGES=1, the
 * connected sites release and the business's row are on, and the page is
 * published. Ported from feat/connected-sites `/b/{handle}`.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { businessJsonLd } from "@/products/connected-sites/contracts";
import { appOrigin, businessPageUrl, formatAddress, jsonLdScriptContent, loadPublishedBusinessPage, mapsUrl, weeklyHours } from "@/products/connected-sites/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

const load = cache(async (handle: string) => {
  // The proxy sets x-tenant only on a client site's host and strips it elsewhere.
  if ((await headers()).get("x-tenant")) return null;
  try {
    return await loadPublishedBusinessPage(handle);
  } catch (error) {
    console.error("[biz page] read failed", error instanceof Error ? error.message : error);
    return null;
  }
});

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;
function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).handle);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  const { facts } = page;
  const place = facts.address?.locality ? ` in ${[facts.address.locality, facts.address.region].filter(Boolean).join(", ")}` : "";
  const title = `${facts.name}${place}`;
  const description = facts.description?.slice(0, 200) ?? `${facts.name}: hours, contact details and services.`;
  const url = businessPageUrl(appOrigin(), page.handle);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title, description, url, type: "website", siteName: facts.name },
  };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="grid gap-4">
    <h2 id={id} className="text-xl font-semibold leading-7 tracking-tight text-warm-black">{title}</h2>
    {children}
  </section>;
}

const action = "inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default async function BusinessPage({ params }: Params) {
  const page = await load((await params).handle);
  if (!page) notFound();
  const { facts } = page;
  const url = businessPageUrl(appOrigin(), page.handle);
  const ld = businessJsonLd(facts, url);
  const hours = weeklyHours(facts);
  const services = facts.services ?? [];
  const areas = facts.service_area ?? [];
  const social = facts.social_links ?? [];
  const hasContact = Boolean(facts.phone || facts.email || facts.address || hours.length);

  return <div className="min-h-dvh bg-surface-base text-warm-black">
    {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(ld) }} /> : null}
    <main className="mx-auto grid w-full max-w-[1120px] gap-12 px-6 pb-24 pt-12 md:px-8 lg:px-12 lg:pt-20">
      <header className="grid max-w-[760px] gap-6">
        <h1 className="font-display text-[2.5rem] font-semibold leading-[3rem] tracking-[-0.02em] sm:text-[4rem] sm:leading-[4.5rem]">{facts.name}</h1>
        {facts.description ? <p className="text-lg leading-7 text-gray-muted sm:text-xl sm:leading-8">{facts.description}</p> : null}
        {facts.booking_url || facts.phone || facts.email ? <div className="flex flex-wrap gap-3">
          {facts.booking_url ? <a href={facts.booking_url} rel="noopener" className={`${action} bg-accent text-on-accent hover:bg-accent/85`}>Book a time</a> : null}
          {facts.phone ? <a href={telHref(facts.phone)} className={`${action} ${facts.booking_url ? "border border-gray-border bg-surface hover:bg-gray-bg" : "bg-accent text-on-accent hover:bg-accent/85"}`}>Call {facts.phone}</a> : null}
          {facts.email && !facts.booking_url ? <a href={`mailto:${facts.email}`} className={`${action} border border-gray-border bg-surface hover:bg-gray-bg`}>Email</a> : null}
        </div> : null}
      </header>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="grid gap-12">
          {services.length ? <Section id="biz-services" title="Services">
            <ul className="grid gap-px overflow-hidden rounded-2xl border border-gray-border bg-gray-border">
              {services.map(service => <li key={service.name} className="grid gap-1 bg-surface p-4 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-base font-medium leading-6">{service.name}</h3>
                  {service.priceText ? <p className="text-sm leading-5 tabular-nums text-gray-muted">{service.priceText}</p> : null}
                </div>
                {service.description ? <p className="text-sm leading-5 text-gray-muted">{service.description}</p> : null}
              </li>)}
            </ul>
          </Section> : null}
          {areas.length ? <Section id="biz-area" title="Service area">
            <ul className="flex flex-wrap gap-2">
              {areas.map(area => <li key={area} className="rounded-full border border-gray-border bg-surface px-3 py-1 text-sm leading-5">{area}</li>)}
            </ul>
          </Section> : null}
        </div>

        {hasContact ? <aside aria-label="Contact and hours" className="order-first grid gap-6 rounded-3xl border border-gray-border bg-surface p-6 lg:order-none">
          {facts.phone || facts.email || facts.address ? <ul className="grid gap-4 text-sm leading-5">
            {facts.phone ? <li><span className="text-gray-muted">Phone </span><a href={telHref(facts.phone)} className="underline-offset-4 hover:underline">{facts.phone}</a></li> : null}
            {facts.email ? <li><span className="text-gray-muted">Email </span><a href={`mailto:${facts.email}`} className="break-all underline-offset-4 hover:underline">{facts.email}</a></li> : null}
            {facts.address ? <li className="grid gap-1">
              <address className="not-italic">{formatAddress(facts.address)}</address>
              <a href={mapsUrl(facts.address)} rel="noopener noreferrer" className="justify-self-start text-accent-text underline underline-offset-4">Get directions</a>
            </li> : null}
          </ul> : null}
          {hours.length ? <div className="grid gap-2">
            <h2 className="text-sm font-medium leading-5">Hours</h2>
            <table className="w-full border-collapse text-sm leading-5">
              <caption className="sr-only">Opening hours</caption>
              <tbody>
                {hours.map(row => <tr key={row.day} className="border-b border-gray-border last:border-b-0">
                  <th scope="row" className="py-2 pr-4 text-left font-normal text-gray-muted">{row.label}</th>
                  <td className={`py-2 text-right tabular-nums ${row.closed ? "text-gray-muted" : ""}`}>{row.hours}</td>
                </tr>)}
              </tbody>
            </table>
          </div> : null}
        </aside> : null}
      </div>

      <footer className="grid gap-2 border-t border-gray-border pt-6 text-xs leading-4 text-gray-muted sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <p>
          Details confirmed by {facts.name}
          {page.confirmedAt ? ` · Updated ${new Date(page.confirmedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
        </p>
        {social.length ? <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Elsewhere online">
          {social.map(link => <li key={link}><a href={link} rel="me noopener" className="underline underline-offset-4 hover:text-warm-black">{hostLabel(link)}</a></li>)}
        </ul> : null}
        <p><a href={`${url}/llms.txt`} className="underline underline-offset-4 hover:text-warm-black">Fact sheet for AI assistants</a> · Page by Strelva</p>
      </footer>
    </main>
  </div>;
}
