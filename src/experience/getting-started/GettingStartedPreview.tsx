"use client";

import { useMemo } from "react";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import type { FoundFact } from "@/products/getting-started/contracts";
import { GettingStarted } from "./GettingStarted";
import { StartBusinessFromCheck } from "./StartBusinessFromCheck";
import { unreadableSite } from "@/products/getting-started/site-words";

const BUSINESS = "d2960000-0000-4000-8000-000000000001";
const FOUND: FoundFact[] = [
  { entity: "fact", key: "phone", id: "d2960000-0000-4000-8000-0000000000a1", label: "Phone", display: "(716) 555-0142", value: "(716) 555-0142", sourceUrl: "https://northside-bakery.example/contact", quote: "Call us at (716) 555-0142 to order", current: "(716) 555-0100", sourceRef: "https://northside-bakery.example/contact", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true },
  { entity: "fact", key: "email", id: "d2960000-0000-4000-8000-0000000000a2", label: "Email", display: "orders@northside-bakery.example", value: "orders@northside-bakery.example", sourceUrl: "https://northside-bakery.example/contact", quote: "orders@northside-bakery.example", current: null, sourceRef: "https://northside-bakery.example/contact", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true },
  { entity: "fact", key: "address", id: "d2960000-0000-4000-8000-0000000000a3", label: "Address", display: "418 Elmwood Ave, Buffalo, NY 14222", value: { formatted: "418 Elmwood Ave, Buffalo, NY 14222", sourceRef: "https://northside-bakery.example/visit", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true }, sourceUrl: "https://northside-bakery.example/visit", quote: "418 Elmwood Ave, Buffalo, NY 14222", current: null, sourceRef: "https://northside-bakery.example/visit", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true },
  { entity: "service", key: null, id: "d2960000-0000-4000-8000-0000000000a4", label: "Service", display: "Custom celebration cakes", value: { name: "Custom celebration cakes", sourceRef: "https://northside-bakery.example/cakes", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true }, sourceUrl: "https://northside-bakery.example/cakes", quote: "Custom celebration cakes", current: null, sourceRef: "https://northside-bakery.example/cakes", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true },
  { entity: "service", key: null, id: "d2960000-0000-4000-8000-0000000000a5", label: "Service", display: "Office breakfast catering", value: { name: "Office breakfast catering", sourceRef: "https://northside-bakery.example/catering", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true }, sourceUrl: "https://northside-bakery.example/catering", quote: "Office breakfast catering for 10 to 200", current: null, sourceRef: "https://northside-bakery.example/catering", status: "unconfirmed", sourceKind: "website_crawl", foundBy: "owner", foundAt: "2026-10-12T15:00:00.000Z", confirmable: true },
];

/** Fictional business. Every request stays in this preview; nothing is read or written. */
export function GettingStartedPreview({ state, mode = "light" }: { state: string; mode?: string }) {
  const transport = useMemo<typeof fetch>(() => async (input, init) => {
    const url = String(input);
    if (state === "loading" || (state === "reading" && init?.method === "POST")) return new Promise<Response>(() => undefined);
    if (url.includes("?check=")) {
      if (state === "check-error") return Response.json({ error: "This check has expired or is unavailable. Run another check." }, { status: 404 });
      return Response.json({ check: { name: state === "check-audit" ? null : "Northside Bakery", suggestedName: state === "check-audit" ? "northside-bakery.example" : "Northside Bakery", website: "https://northside-bakery.example/", kind: state === "check-audit" ? "website_audit" : "ai_visibility" } });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    if (body.action === "read_website") {
      if (state === "read-error") return Response.json({ error: unreadableSite("robots_blocked", "northside-bakery.example") }, { status: 422 });
      return Response.json({ reading: { url: "https://northside-bakery.example/", revision: 2, pagesRead: state === "found-empty" ? 1 : 5, facts: state === "found-empty" ? [] : FOUND } });
    }
    if (body.action === "decide_found_facts") return Response.json({ confirmed: 2, websiteSaved: false, revision: 3, waiting: [] });
    if (body.action === "start_from_check") return Response.json({ error: "Preview only: nothing was created." }, { status: 409 });
    return Response.json({ error: "Not in this preview." }, { status: 404 });
  }, [state]);
  const check = state.startsWith("check");
  const links = { home: "#home", details: "#details", agency: "#agency", google: state === "closed" ? null : "#google", connect: state === "closed" ? null : "#connect", request: state === "request" ? "#request" : null };
  return <div data-workspace-theme="linen" data-workspace-mode={mode}>
    <WorkspaceRequestContext.Provider value={transport}>
      <GettingStarted key={state} account="Maya Ortiz" mode={mode === "dark" ? "dark" : "light"} business={{ workspaceId: BUSINESS, name: "Northside Bakery", website: state === "no-website" ? null : "https://northside-bakery.example/", canConfirm: state !== "member", revision: 2, waiting: [] }} links={links} />
      {check ? <StartBusinessFromCheck resultId="scan_preview" workspaceName="North Studio" savingHere={false} saveHereError="" onSaveHere={() => undefined} onClose={() => undefined} /> : null}
    </WorkspaceRequestContext.Provider>
    <p className="px-6 pb-6 text-xs text-gray-muted">Fictional preview · nothing is read, created or saved.</p>
  </div>;
}
