"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { businessEntryInputSchema, businessEntryResultSchema, type BusinessEntryInput } from "@/platform/workspaces/business-entry-contract";
import { businessStartHref, businessStartAsk, type BusinessStartProduct } from "@/platform/workspaces/business-start";
import { useWorkspaceRequest } from "./WorkspaceRequest";
import { gettingStartedHref } from "@/platform/business-signup-release";
import { requestDraftKey, writeRequestDraft } from "./request-draft";
import { XaButton, XaButtonLink, XaChecklist, XaChoices, XaEntrySteps, XaField, XaHeadline, XaPebbleAvatar, XaSays, XaStatus, XaSystemTile, XaTextArea } from "@/components/ui/strelva/Xa";

const choicesSchema = z.object({ actorId: z.string().uuid(), actorEmail: z.string().email(), businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() })) });
export type { BusinessStartProduct } from "@/platform/workspaces/business-start";
function message(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? String((body as { error: string }).error) : fallback;
}

/** Explicit ownership setup. The server saves the optional request atomically. */
/** Direct setup opens Getting started. Website help opens agency selection. */
export function BusinessSetupPanel({ startProduct = "help", initialRequest = businessStartAsk(startProduct), initialName = "", sourceCheckId, gettingStarted = false, initialKeeps, navigate = href => window.location.assign(href) }: { initialKeeps?: readonly Keep[]; initialRequest?: string; initialName?: string; sourceCheckId?: string; startProduct?: BusinessStartProduct; gettingStarted?: boolean; navigate?: (href: string) => void }) {
  const transport = useWorkspaceRequest();
  const [choices, setChoices] = useState<z.infer<typeof choicesSchema> | null>(null);
  const [selected, setSelected] = useState("new");
  const [name, setName] = useState(initialName);
  const [request, setRequest] = useState(initialRequest);
  const [pending, setPending] = useState<BusinessEntryInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [keeps, setKeeps] = useState<Set<Keep>>(() => new Set([...(initialKeeps ?? []), ...(initialRequest.trim() ? ["own" as const] : [])]));
  const active = useRef(false);
  const generation = useRef(0);
  const mutation = useRef(false);
  useEffect(() => {
    active.current = true;
    generation.current += 1;
    const abort = new AbortController();
    setChoices(null); setLoading(true); setError(""); setSignIn(false); setPending(null);
    transport("/api/workspace/businesses", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (abort.signal.aborted) return;
      if (response.redirected && new URL(response.url).pathname.startsWith("/sign-in")) { setSignIn(true); setChoices(null); throw new Error("Sign in again to continue with the retained request."); }
      const body: unknown = await response.json().catch(() => null);
      if (abort.signal.aborted) return;
      if (!response.ok) { setSignIn(response.status === 401); throw new Error(message(body, "Business access could not be confirmed.")); }
      const result = choicesSchema.safeParse(body);
      if (!result.success) throw new Error("Business access could not be confirmed.");
      setChoices(result.data);
      try {
        const raw = sessionStorage.getItem(`strelva:business-entry:${result.data.actorId}`);
        const retained = raw && raw.length <= 20000 ? businessEntryInputSchema.safeParse(JSON.parse(raw)) : null;
        if (retained?.success) {
          setPending(retained.data);
          setSelected(retained.data.destination.kind === "new" ? "new" : retained.data.destination.workspaceId);
          setName(retained.data.destination.kind === "new" ? retained.data.destination.name : "");
          setRequest(retained.data.initialRequest || "");
          setKeeps(new Set(retained.data.initialRequest ? ["own"] : []));
        }
      } catch { /* Storage is checked before a new command can be sent. */ }
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Business access is unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { active.current = false; generation.current += 1; abort.abort(); };
  }, [transport, attempt]);

  async function save(event: FormEvent<HTMLFormElement>, initialRequest: string) {
    event.preventDefault();
    if (!choices || mutation.current) return;
    const version = generation.current;
    const isCurrent = () => active.current && generation.current === version;
    const key = `strelva:business-entry:${choices.actorId}`;
    let command: BusinessEntryInput;
    try {
      if (!pending && selected !== "new" && !choices.businesses.some(item => item.id === selected)) throw new Error("Unknown business");
      command = pending || businessEntryInputSchema.parse({ destination: selected === "new" ? { kind: "new", name } : { kind: "existing", workspaceId: selected }, initialRequest: startProduct === "website" ? null : initialRequest || null, ...(sourceCheckId ? { sourceCheckId } : {}), idempotencyKey: crypto.randomUUID() });
      sessionStorage.setItem(key, JSON.stringify(command));
    } catch { setError("Check the business name and request, and allow session storage. Nothing was sent."); return; }
    mutation.current = true; setPending(command); setSaving(true); setError("");
    try {
      const response = await transport("/api/workspace/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!isCurrent()) return;
      if (response.redirected && new URL(response.url).pathname.startsWith("/sign-in")) { setSignIn(true); setChoices(null); throw new Error("Sign in again to continue with the retained request."); }
      const body: unknown = await response.json().catch(() => null);
      if (!isCurrent()) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) { sessionStorage.removeItem(key); setPending(null); }
        if ([401, 403].includes(response.status)) { setChoices(null); setSignIn(response.status === 401); }
        throw new Error(message(body, "Setup is not confirmed. Retry the retained setup before creating another business."));
      }
      const result = businessEntryResultSchema.safeParse(body);
      if (!result.success) throw new Error("Setup returned an unconfirmed result. Retry the retained setup.");
      if (command.initialRequest && !result.data.requestId && !result.data.askConversationId) {
        throw new Error("Your business was created, but saving your ask is not confirmed. Retry this setup to keep your words.");
      }
      if (command.sourceCheckId) {
        const saved = await transport("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_business_check", workspaceId: result.data.workspaceId, resultId: command.sourceCheckId }) });
        if (!isCurrent()) return;
        const savedBody: unknown = await saved.json().catch(() => null);
        if (!isCurrent()) return;
        const check = z.object({ work: z.object({ id: z.string().uuid(), workspaceId: z.literal(result.data.workspaceId) }) }).safeParse(savedBody);
        if (!saved.ok || !check.success) throw new Error(message(savedBody, "Your business is saved, but the check could not be saved. Retry this setup to keep the same business and check."));
      }
      if (command.initialRequest && !writeRequestDraft(sessionStorage, requestDraftKey({ actorEmail: choices.actorEmail, workspaceId: result.data.workspaceId }), command.initialRequest)) {
        throw new Error("Your ask is saved, but it could not be carried to Home. Allow session storage, then retry this setup.");
      }
      sessionStorage.removeItem(key); setPending(null);
      // Choosing help never assigns an agency or files the owner's intent as an Ask.
      if (startProduct === "website") {
        navigate(`/workspace?${new URLSearchParams({ workspaceId: result.data.workspaceId, view: "help", intent: "website" })}`);
        return;
      }
      // Keep a saved Ask draft for Home, after the owner has the first-run context.
      if (gettingStarted && startProduct === "help") {
        navigate(gettingStartedHref(result.data.workspaceId, result.data.requestId));
        return;
      }
      navigate(`/workspace?workspaceId=${encodeURIComponent(result.data.workspaceId)}&view=home`);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Setup is not confirmed. Retry the retained setup."); }
    finally { mutation.current = false; if (isCurrent()) setSaving(false); }
  }
  if (loading) return <p role="status" className="m-0"><XaStatus kind="working">Checking the businesses you can manage</XaStatus></p>;
  if (!choices) return <section className="flex flex-col items-start gap-4"><XaHeadline>{signIn ? "Sign in again to continue." : "Your businesses didn't load."}</XaHeadline><div role="alert"><XaSays>{error || "Business access is unavailable."}</XaSays></div>{signIn ? <XaButtonLink variant="primary" href={`/sign-in?next=${encodeURIComponent(sourceCheckId ? `/workspace/business/new?check=${encodeURIComponent(sourceCheckId)}` : businessStartHref(startProduct))}`}>Sign in to continue</XaButtonLink> : <XaButton onClick={() => setAttempt(value => value + 1)}>Check again</XaButton>}</section>;
  const locked = saving || Boolean(pending);
  // The owner door (sign-up): what Strelva keeps becomes the business's first ask, in plain words.
  const door = gettingStarted && startProduct === "help";
  const ownWords = !door || keeps.has("own");
  const composed = door ? [...KEEPS.filter(item => item.value !== "own" && keeps.has(item.value)).map(item => item.ask), ownWords ? request.trim() : ""].filter(Boolean).join(" ") : request.trim();
  const label = saving ? "Saving" : pending ? "Retry safely" : startProduct === "website" ? "Continue to agencies" : door ? (selected === "new" ? (name.trim() ? `Create ${name.trim()}` : "Create your business") : "Continue with this business") : request.trim() ? "Save business and ask" : "Continue with this business";
  return <form className="flex flex-col gap-5" aria-label="Choose your business" onSubmit={event => void save(event, composed)}>
    {door ? <XaEntrySteps steps={GETTING_STARTED_STEPS} current={0} /> : null}
    <div className="flex flex-col gap-2">
      <XaHeadline>Which business is this for?</XaHeadline>
      <p className="m-0 text-[16px] leading-[21px] text-[var(--st-text-2)]">No website purchase is required. You can rename it later.</p>
    </div>
    {choices.businesses.length ? <XaChoices label="Business" value={selected} onChange={value => { if (!locked) setSelected(value); }} options={[{ value: "new", label: "A new business", disabled: locked }, ...choices.businesses.map(item => ({ value: item.id, label: item.name, detail: "You manage this one", disabled: locked }))]} /> : null}
    {selected === "new" ? <XaField label="Business name" value={name} maxLength={120} required disabled={locked} autoComplete="organization" onChange={event => setName(event.target.value)} /> : null}
    {door ? <XaChecklist label="What should Strelva keep for you?" checked={keeps} onChange={(value, on) => { if (locked) return; setKeeps(current => { const next = new Set(current); if (on) next.add(value); else next.delete(value); return next; }); }}
      items={KEEPS.map(item => ({ value: item.value, label: item.label, disabled: locked, end: item.value === "own" ? <XaPebbleAvatar size={28} /> : <XaSystemTile kind={item.value} size={28} /> }))} /> : null}
    {ownWords && startProduct !== "website" && (startProduct === "help" || request) ? <XaTextArea label={door ? "In your own words" : "What do you want to do?"} value={request} maxLength={3000} rows={door ? 3 : 5} disabled={locked} placeholder={door ? "Send a reminder the day before each visit" : undefined} onChange={event => setRequest(event.target.value)} /> : null}
    {pending ? <XaSays>Your setup is saved, so trying again will not make a second business.</XaSays> : null}
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    <XaButton type="submit" variant="primary" size="lg" block busy={saving} disabled={saving || (selected === "new" && !name.trim())}>{label}</XaButton>
    <p className="m-0 text-[13px] leading-[1.45] text-[var(--st-text-2)]">{startProduct === "website" ? "Next, choose an agency and review what it can do. A website proposal is sent only after you choose. Nothing is agreed until scope, timing and price are confirmed." : door ? "What you pick is saved as your first ask, in your words. Nothing is built, shared or sent until you say yes." : "Your words are saved as your own ask when no agency is selected. Saving does not accept a price or deadline, start delivery, grant agency access, or send email."}</p>
  </form>;
}

/** The three steps of the owner door, shared with Getting started (Pen XA · B2–B4). */
export const GETTING_STARTED_STEPS = ["Your business", "Your site", "Check it"] as const;

export type Keep = "website" | "bookings" | "form" | "own";
/** What a new owner can ask Strelva to keep. Each becomes one plain sentence of their first ask. */
const KEEPS: readonly { value: Keep; label: string; ask: string }[] = [
  { value: "website", label: "Keep my website working", ask: "Keep my website working." },
  { value: "bookings", label: "Take bookings", ask: "Take bookings." },
  { value: "form", label: "Collect a form, like an intake", ask: "Collect a form, like an intake form." },
  { value: "own", label: "Something else, in my own words", ask: "" },
];
