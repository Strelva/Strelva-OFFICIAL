"use client";

import { useMemo, useState } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkspaceRequestContext } from "@/experience/workspace/WorkspaceRequest";
import { heldBriefKey, type FoundFact } from "@/products/getting-started/contracts";
import { GettingStarted } from "./GettingStarted";
import { StartBusinessFromCheck } from "./StartBusinessFromCheck";

const BUSINESS = "d2960000-0000-4000-8000-000000000001";
const FOUND: FoundFact[] = [
  { entity: "fact", key: "phone", id: "phone:1", label: "Phone", display: "(716) 555-0142", value: "(716) 555-0142", sourceUrl: "https://northside-bakery.example/contact", quote: "Call us at (716) 555-0142 to order", current: "(716) 555-0100" },
  { entity: "fact", key: "email", id: "email:1", label: "Email", display: "orders@northside-bakery.example", value: "orders@northside-bakery.example", sourceUrl: "https://northside-bakery.example/contact", quote: "orders@northside-bakery.example", current: null },
  { entity: "fact", key: "address", id: "address:1", label: "Address", display: "418 Elmwood Ave, Buffalo, NY 14222", value: { formatted: "418 Elmwood Ave, Buffalo, NY 14222" }, sourceUrl: "https://northside-bakery.example/visit", quote: "418 Elmwood Ave, Buffalo, NY 14222", current: null },
  { entity: "service", id: "service:cakes", label: "Service", display: "Custom celebration cakes", value: { name: "Custom celebration cakes" }, sourceUrl: "https://northside-bakery.example/cakes", quote: "Custom celebration cakes", current: null },
  { entity: "service", id: "service:catering", label: "Service", display: "Office breakfast catering", value: { name: "Office breakfast catering" }, sourceUrl: "https://northside-bakery.example/catering", quote: "Office breakfast catering for 10 to 200", current: null },
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
      if (state === "read-error") return Response.json({ error: "This website asks crawlers not to read it. Add your details yourself." }, { status: 422 });
      return Response.json({ reading: { url: "https://northside-bakery.example/", revision: 2, pagesRead: state === "found-empty" ? 1 : 5, facts: state === "found-empty" ? [] : FOUND } });
    }
    if (body.action === "confirm_found_facts") return Response.json({ saved: ["phone", "email"], revision: 3 });
    if (body.action === "start_from_check") return Response.json({ error: "Preview only: nothing was created." }, { status: 409 });
    return Response.json({ error: "Not in this preview." }, { status: 404 });
  }, [state]);
  const [held] = useState(() => {
    if (state === "held-brief" && typeof window !== "undefined") window.sessionStorage.setItem(heldBriefKey(BUSINESS), "We need online cake orders before the holidays, with pickup times.");
    return true;
  });
  const check = state.startsWith("check");
  const links = { home: "#home", details: "#details", agency: "#agency", google: state === "closed" ? null : "#google", connect: state === "closed" ? null : "#connect", request: state === "request" ? "#request" : null };
  return <div data-workspace-theme="linen" data-workspace-mode={mode} data-held={held || undefined}>
    <WorkspaceRequestContext.Provider value={transport}>
      <StrelvaShell title="Getting started" context={<span>Northside Bakery</span>} accountName="Maya Ortiz" accountDetail="Owner">
          <GettingStarted key={state} business={{ workspaceId: BUSINESS, name: "Northside Bakery", website: state === "no-website" || state === "held-brief" ? null : "https://northside-bakery.example/", canConfirm: state !== "member", revision: 2 }} links={links} />
      </StrelvaShell>
      {check ? <StartBusinessFromCheck resultId="scan_preview" workspaceName="Maya's workspace" savingHere={false} saveHereError="" onSaveHere={() => undefined} onClose={() => undefined} /> : null}
    </WorkspaceRequestContext.Provider>
    <p className="px-6 pb-6 text-xs text-gray-muted">Fictional preview · nothing is read, created or saved.</p>
  </div>;
}
