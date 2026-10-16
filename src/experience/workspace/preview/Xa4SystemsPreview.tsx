"use client";
/**
 * XA-4 · Systems up close, in the real StrelvaShell and XA sidebar, with the
 * real System page, Bookings, Inquiries and History components. Fictional
 * fixtures only. Every write is answered in the browser by a fixture
 * response; nothing reaches a server, a site, an inbox or a calendar.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaPinnedItem } from "@/experience/app-frame/workspace-places";
import { SystemPage } from "@/experience/systems/SystemPage";
import { systemHref } from "@/experience/systems/model";
import { WorkspaceInquiries } from "@/experience/places/WorkspaceInquiries";
import { WorkspaceInquirySystem } from "@/experience/places/WorkspaceInquirySystem";
import { WorkspaceRequestContext } from "../WorkspaceRequest";
import { XA4_INBOX, XA4_SITE, XA4_WORKSPACE, type Xa4Screen, type Xa4State, harborBookingRequestDecision, harborForm, harborFormDetail, harborInbox, harborLeads, harborPossibility, harborWebsite, harborWebsiteDetail } from "./xa4-systems-fixture";


const BASE = "/preview/strelva/xa/xa4-systems";
const never = () => new Promise<Response>(() => undefined);

/** One fixture answer per route the screens call. Unknown calls stay unanswered rather than reaching a server. */
function fixtureFetch(screen: Xa4Screen, state: Xa4State): typeof fetch {
  // The one booking request is decided once; afterwards Needs you no longer lists it.
  let bookingDecided = false;
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = url.pathname;
    if (state === "loading" && path.startsWith("/api/workspace/") && !path.startsWith("/api/workspace/owner-brand")) return never();
    if (path === "/api/workspace/systems/website") {
      if (state === "loading") return never();
      if (state === "error" && screen === "history") return Response.json({ error: "History could not be read just now." }, { status: 503 });
      return Response.json({ detail: harborWebsiteDetail(state === "empty" ? "empty" : state === "waiting" ? "waiting" : "full") });
    }
    if (path === "/api/workspace/systems/website/restore") return Response.json({ status: "requested", message: "Prepared for review. Your live site is unchanged until you say yes." });
    if (path === "/api/workspace/systems/make-real") {
      await new Promise(resolve => setTimeout(resolve, 900));
      if (state === "error") return Response.json({ error: "harbordental.com did not answer." }, { status: 502 });
      return Response.json({ live: { live: true, status: "done", headline: screen === "form" ? "The new-patient form is live" : "Live on harbordental.com", activationId: "fixture-activation" } });
    }
    if (path === "/api/workspace/site-changes") return Response.json({ requestId: "4a000000-0000-4000-8000-0000000000aa", requests: [] }, { status: 201 });
    if (path === "/api/workspace/inquiries/reply" && method === "POST") return Response.json({ outcome: { status: "suppressed", providerMessageId: null, acceptedAt: null, retryable: false } });
    if (path === "/api/workspace/inquiries/system") return Response.json({ details: [state === "done" && screen === "form" ? { ...harborFormDetail, lifecycle: "live", health: "Patients get it in their booking confirmation." } : harborFormDetail] });
    if (path === "/api/workspace/inquiries") return Response.json({ data: harborLeads("empty") });
    if (path === "/api/workspace/needs-you" && method === "POST") { bookingDecided = true; await new Promise(resolve => setTimeout(resolve, 600)); return Response.json({ status: "done" }); }
    if (path === "/api/workspace/needs-you") return Response.json({ role: "owner", items: screen === "bookings" && state === "waiting" && !bookingDecided ? [harborBookingRequestDecision()] : [], complete: true, handled: [], handledAvailable: true });
    if (path === "/api/workspace/bookings" && method === "POST") return Response.json({ error: "This fictional preview cannot change bookings." }, { status: 403 });
    if (path.startsWith("/api/workspace/owner-brand")) return Response.json({ brand: null });
    if (path.startsWith("/api/")) return never();
    return window.fetch(input, init);
  };
}

export function Xa4SystemsPreview({ screen, state, mode, children }: { screen: Xa4Screen; state: Xa4State; mode: "light" | "dark"; /** Server-rendered screen (Bookings renders on the server, as its route does). */ children?: ReactNode }) {
  const router = useRouter();
  const request = useMemo(() => fixtureFetch(screen, state), [screen, state]);
  // Components that call window.fetch directly (inquiry replies, bookings) get the same fixture answers.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const original = window.fetch;
    const local: typeof fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith("/api/") ? request(input, init) : original(input, init);
    };
    window.fetch = local;
    const shown = window.setTimeout(() => setReady(true));
    return () => { window.clearTimeout(shown); if (window.fetch === local) window.fetch = original; };
  }, [request]);
  const href = (next: Xa4Screen) => `${BASE}/${next}${mode === "dark" ? "?mode=dark" : ""}`;
  const formLive = screen === "form" && state === "done";
  const pinned: StrelvaPinnedItem[] = [
    { id: "website", kind: "website", title: "Website", href: href("website"), current: screen === "website" || screen === "possibility" || screen === "history", ...(screen === "possibility" ? { detail: "1 idea" } : state === "error" && screen === "website" ? { state: "waits" as const } : { detail: "Live" }) },
    { id: "bookings", kind: "bookings", title: "Bookings", href: href("bookings"), current: screen === "bookings", detail: "6 this week" },
    { id: "inbox", kind: "inquiries", title: "Inquiries", href: href("inbox"), current: screen === "inbox", ...(screen === "inbox" && (state === "done" || state === "empty") ? { detail: "Nothing new" } : { state: "waits" as const }) },
    { id: "form", kind: "app", title: "New-patient form", href: href("form"), current: screen === "form", ...(formLive ? { detail: "Live" } : { state: "draft" as const }) },
  ];
  const shell = {
    appBase: "/preview/strelva", signOut: null, systemsReleased: true, mode, workspaceName: "Harbor Dental", accountName: "Dr. Amy Lin",
    pinned: state === "empty" && screen === "website" ? pinned.slice(0, 1) : pinned,
    agency: { name: "North Studio", person: "Maya", color: "#2f5236" },
    notice: <p style={{ margin: 0, padding: "6px 16px", fontSize: 12, color: "var(--st-text-3)" }}>Fictional preview. Nothing here reaches a real business.</p>,
  } as const;
  const frame = (title: string, children: ReactNode) => <StrelvaShell {...shell} title={title} active="system">
    <WorkspaceRequestContext.Provider value={request}>{ready ? children : null}</WorkspaceRequestContext.Provider>
  </StrelvaShell>;
  const page = {
    workspaceId: XA4_WORKSPACE, appBase: "/preview/strelva", readOnly: false, canMakeReal: true, sources: [], businessName: "Harbor Dental", ownerName: "Dr. Lin", localPreview: true,
    systemHref: (id: string) => id === XA4_INBOX ? href("inbox") : id === XA4_SITE ? href("website") : systemHref("/preview/strelva", XA4_WORKSPACE, id), onHome: () => router.push("/preview/strelva/xa"), onAsk: () => undefined,
  } as const;

  if (screen === "website" || screen === "possibility" || screen === "history") {
    const site = harborWebsite(screen === "possibility" ? "waiting" : state === "error" ? "error" : state === "empty" ? "empty" : state === "waiting" ? "waiting" : state === "done" ? "done" : "ready");
    const system = screen === "possibility" ? { ...site, possibilities: [harborPossibility(state === "waiting")] } : site;
    return frame(system.name, <SystemPage key={`${screen}:${state}`} {...page} system={state === "loading" && screen === "website" ? undefined : system} loading={state === "loading"}
      initialView={screen === "history" ? "history" : "site"} initialPossibilityId={screen === "possibility" ? system.possibilities[0]?.id : undefined} systems={[system, harborInbox()]} />);
  }
  if (screen === "form") {
    const form = harborForm();
    const system = formLive ? { ...form, lifecycle: "live" as const, possibilities: [], health: { state: "healthy" as const, summary: "Patients get it in their booking confirmation." } } : state === "error" ? { ...form, possibilities: [{ ...form.possibilities[0]!, staleReason: "Your insurance list changed after Maya made this." , status: "exploring" as const }] } : form;
    return frame(system.name, <SystemPage key={`form:${state}`} {...page} system={state === "loading" ? undefined : system} systems={[system, harborWebsite("ready")]} loading={state === "loading"} inquiryInbox />);
  }
  if (screen === "bookings") return frame("Bookings", children);
  const leads = state === "error" ? { kind: "error" as const } : { kind: "ready" as const, data: harborLeads(state === "empty" ? "empty" : state === "done" ? "done" : "ready") };
  return frame("Inquiries", state === "loading" ? <InboxLoading /> : <WorkspaceInquiries workspaceId={XA4_WORKSPACE} state={leads} embedded />);
}

/* The route's own loading state. */
function InboxLoading() {
  return <WorkspaceInquirySystem workspaceId={XA4_SITE} />;
}
