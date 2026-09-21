"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { businessEntryInputSchema, businessEntryResultSchema, type BusinessEntryInput } from "@/platform/workspaces/business-entry-contract";
import { useWorkspaceRequest } from "./WorkspaceRequest";

const choicesSchema = z.object({ actorId: z.string().uuid(), businesses: z.array(z.object({ id: z.string().uuid(), name: z.string() })) });
export type BusinessStartProduct = "applications" | "onboarding" | "tracker" | "document" | "help";
function message(body: unknown, fallback: string): string {
  return body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? String((body as { error: string }).error) : fallback;
}

/** Explicit ownership setup. The server saves the optional request atomically. */
export function BusinessSetupPanel({ initialRequest = "", startProduct = "help" }: { initialRequest?: string; startProduct?: BusinessStartProduct }) {
  const transport = useWorkspaceRequest();
  const [choices, setChoices] = useState<z.infer<typeof choicesSchema> | null>(null);
  const [selected, setSelected] = useState("new");
  const [name, setName] = useState("");
  const [request, setRequest] = useState(initialRequest);
  const [pending, setPending] = useState<BusinessEntryInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
        }
      } catch { /* Storage is checked before a new command can be sent. */ }
    }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Business access is unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { active.current = false; generation.current += 1; abort.abort(); };
  }, [transport, attempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choices || mutation.current) return;
    const version = generation.current;
    const isCurrent = () => active.current && generation.current === version;
    const key = `strelva:business-entry:${choices.actorId}`;
    let command: BusinessEntryInput;
    try {
      if (!pending && selected !== "new" && !choices.businesses.some(item => item.id === selected)) throw new Error("Unknown business");
      command = pending || businessEntryInputSchema.parse({ destination: selected === "new" ? { kind: "new", name } : { kind: "existing", workspaceId: selected }, initialRequest: request.trim() || null, idempotencyKey: crypto.randomUUID() });
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
      sessionStorage.removeItem(key); setPending(null);
      window.location.assign(result.data.requestId ? `/workspace/delivery/${result.data.requestId}` : `/workspace?workspaceId=${encodeURIComponent(result.data.workspaceId)}&view=${startProduct}`);
    } catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : "Setup is not confirmed. Retry the retained setup."); }
    finally { mutation.current = false; if (isCurrent()) setSaving(false); }
  }
  if (loading) return <p role="status">Checking the businesses you can manage…</p>;
  if (!choices) return <section className="space-y-4"><p role="alert">{error || "Business access is unavailable."}</p>{signIn ? <Link href={`/sign-in?next=${encodeURIComponent(`/workspace/business/new?start=${startProduct}`)}`}>Sign in to continue</Link> : <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Check again</Button>}</section>;
  const locked = saving || Boolean(pending);
  return <form className="space-y-4" aria-label="Choose the customer business" onSubmit={event => void save(event)}>
    <h2 className="text-xl">Which business is this for?</h2><p className="text-gray-muted">Use a business you manage or create one. No website purchase is required. Existing personal work stays separate.</p>
    {choices.businesses.length ? <SelectInput label="Business" value={selected} disabled={locked} onChange={event => setSelected(event.target.value)} options={[{value:"new",label:"Create a new business"},...choices.businesses.map(item=>({value:item.id,label:item.name}))]} /> : null}
    {selected === "new" ? <TextInput label="Business name" value={name} maxLength={120} required disabled={locked} onChange={event => setName(event.target.value)} /> : null}
    {startProduct === "help" || request ? <TextArea label="Request for Strelva" value={request} maxLength={3000} rows={5} disabled={locked} onChange={event => setRequest(event.target.value)} /> : null}
    {pending ? <p role="status">A setup request is retained. Retrying uses the same business and request identity, not a second creation.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <Button type="submit" disabled={saving || (selected === "new" && !name.trim())}>{saving ? "Saving…" : pending ? "Retry retained setup" : request.trim() ? "Save business and request" : "Continue with this business"}</Button>
    <p className="text-sm text-gray-muted">Saving a request does not accept a price or deadline, start delivery, grant provider access, or send email.</p>
  </form>;
}
