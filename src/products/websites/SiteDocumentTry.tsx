"use client";

import { createElement, useState, type CSSProperties, type ReactNode, type MouseEvent } from "react";
import { siteDocumentSchema, type SiteDocument } from "./site-document-schema";
import { SITE_CATALOG_CSS, sitePageTree, siteThemeVariables, type SiteTree } from "./site-render-tree";
import { StrelvaBookingForm } from "../../../custom-repo-starter/StrelvaBookingForm";
import type { PublicBookingSchedule } from "../../../custom-repo-starter/booking-client";

/** Native catalog, with internal navigation confined to this candidate. No provider callbacks. */
export function SiteDocumentTry({ document: raw, bookingSchedule, bookingPath }: { document: SiteDocument; bookingSchedule?: PublicBookingSchedule; bookingPath?: string }) {
  const document = siteDocumentSchema.parse(raw);
  const [path, setPath] = useState(bookingPath && document.pages.some(page => page.path === bookingPath) ? bookingPath : "/");
  const render = (tree: SiteTree, key: string): ReactNode => {
    if (typeof tree === "string") return tree;
    if (tree.attrs["data-strelva-capability"] === "booking" && bookingSchedule) return <StrelvaBookingForm key={key} schedule={bookingSchedule} testOnly submitLabel="Try booking this time" onReserve={async slot => ({ schemaVersion: 1, reservationId: "test-reservation", managementToken: "test-only-token", capabilityId: bookingSchedule.capabilityId, version: bookingSchedule.version, provider: bookingSchedule.provider, status: "pending", title: bookingSchedule.name, start: slot.start, end: slot.end, timeZone: bookingSchedule.timeZone })} />;
    if (tree.attrs["data-strelva-capability"] === "inquiry") return <p key={key}>Inquiry actions are held in this booking test.</p>;
    const { class: className, for: htmlFor, tabindex: tabIndex, ...attrs } = tree.attrs;
    return createElement(tree.tag, { ...attrs, className, htmlFor, tabIndex, key }, ...tree.children.map((child, index) => render(child, `${key}-${index}`)));
  };
  function navigate(event: MouseEvent<HTMLDivElement>) {
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const next = link.getAttribute("href");
    if (document.pages.some(page => page.path === next)) setPath(next!);
  }
  return <section aria-label="Working website candidate" onClick={navigate} style={siteThemeVariables(document) as CSSProperties}>
    <p className="mb-3 text-xs text-gray-muted" role="status">Preview page: {path}. Links stay inside this test.</p>
    <style>{SITE_CATALOG_CSS}</style>
    {render(sitePageTree(document, path, { preview: !bookingSchedule }), path)}
  </section>;
}
