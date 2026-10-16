"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { XaButton, XaDecision, XaEmpty, XaField, XaFold, XaHeadline, XaPage, XaPageChange, XaSelect, XaStatus, XaTextArea, XaTextLink, XaWorking } from "@/components/ui/strelva/Xa";
import { XaNote, XaObjectPage } from "@/components/ui/strelva/Xa";
import styles from "./agency-website.module.css";
import {
  agencyManagedWebsiteDraftGrantSchema,
  agencyWebsiteDraftStateSchema,
  type AgencyManagedWebsiteDraftGrant,
  type AgencyWebsiteDraftState,
} from "@/platform/offerings/agency-website-draft-contracts";

function errorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") return value.error;
  return fallback;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

type DraftReceipt = {
  section: string;
  revision: number | null;
  revisionId?: string;
  dataHash?: string;
};

function receiptFrom(value: unknown, section: string): DraftReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outer = value as Record<string, unknown>;
  const candidate = outer.websiteDraft && typeof outer.websiteDraft === "object" && !Array.isArray(outer.websiteDraft)
    ? outer.websiteDraft as Record<string, unknown>
    : outer;
  const revision = typeof candidate.revision === "number" && Number.isInteger(candidate.revision) ? candidate.revision : null;
  return {
    section: typeof candidate.section === "string" && candidate.section.trim() ? candidate.section : section,
    revision,
    ...(typeof candidate.revisionId === "string" ? { revisionId: candidate.revisionId } : {}),
    ...(typeof candidate.dataHash === "string" ? { dataHash: candidate.dataHash } : {}),
  };
}

/** Pages a hero button usually opens, by name; anything else is typed. */
const LINK_CHOICES = [
  { value: "/book", label: "The booking page" },
  { value: "/contact", label: "The contact page" },
  { value: "/services", label: "The services page" },
  { value: "/", label: "The home page" },
] as const;

export function AgencyManagedWebsiteDraftExperience({ bindingId, section = "hero", businessName, websiteAddress, request, crumbs }: { bindingId: string; section?: string; businessName?: string; websiteAddress?: string; request?: typeof fetch; crumbs?: ReactNode }) {
  const [grant, setGrant] = useState<AgencyManagedWebsiteDraftGrant | null>(null);
  const [state, setState] = useState<AgencyWebsiteDraftState | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [customerWebsiteHref, setCustomerWebsiteHref] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DraftReceipt | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setStatus("loading");
    setMessage("");
    const response = await (request ?? fetch)(`/api/agency-website-draft-access?bindingId=${encodeURIComponent(bindingId)}&section=${encodeURIComponent(section)}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) throw new Error(errorMessage(body, "Managed website draft access could not be confirmed."));
    const value = body && typeof body === "object" ? body as { grant?: unknown; state?: unknown; customerWebsiteHref?: unknown } : {};
    const nextGrant = value.grant ? agencyManagedWebsiteDraftGrantSchema.parse(value.grant) : null;
    const nextState = value.state ? agencyWebsiteDraftStateSchema.parse(value.state) : null;
    if (signal.aborted) return;
    setGrant(nextGrant);
    setState(nextState);
    setCustomerWebsiteHref(typeof value.customerWebsiteHref === "string" ? value.customerWebsiteHref : null);
    setDraft(nextState ? JSON.stringify(nextState.data, null, 2) : "{}");
    setStatus("ready");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingId, section]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Managed website draft access could not be confirmed.");
      }
    });
    return () => controller.abort();
  }, [load, reload]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const active = Boolean(grant && now !== null && grant.status === "active" && Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > now);
  const parsed = useMemo(() => parseJson(draft), [draft]);

  function fieldValue(key: string): string {
    const value = parsed?.[key];
    return typeof value === "string" ? value : "";
  }

  function updateField(key: string, value: string) {
    setDraft((current) => JSON.stringify({ ...(parseJson(current) ?? {}), [key]: value }, null, 2));
  }

  async function prepareAndRun() {
    if (!grant || !state || !active) return;
    if (!parsed) {
      setMessage("Enter a JSON object for this native website section.");
      return;
    }
    setSaving(true);
    setMessage("");
    setReceipt(null);
    try {
      const prepareResponse = await (request ?? fetch)("/api/agency-website-draft-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", assignmentId: grant.assignmentId, bindingId, section, data: parsed, expectedRevision: state.revision, expectedHash: state.dataHash }),
      });
      const prepareBody = await prepareResponse.json().catch(() => null) as unknown;
      if (!prepareResponse.ok) throw new Error(errorMessage(prepareBody, "The draft could not be prepared."));
      const runResponse = await (request ?? fetch)("/api/operational-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", assignmentId: grant.assignmentId }),
      });
      const runBody = await runResponse.json().catch(() => null) as unknown;
      if (!runResponse.ok) throw new Error(errorMessage(runBody, "The assigned draft command could not be run."));
      const responsibility = runBody && typeof runBody === "object" && "responsibility" in runBody ? runBody.responsibility : null;
      const payload = responsibility && typeof responsibility === "object" && "payload" in responsibility ? responsibility.payload : null;
      const steps = payload && typeof payload === "object" && "steps" in payload && Array.isArray(payload.steps) ? payload.steps : [];
      const last = steps.at(-1);
      const result = last && typeof last === "object" && "result" in last ? last.result : null;
      setReceipt(receiptFrom(result, section));
      const controller = new AbortController();
      await load(controller.signal);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The draft command could not be completed.");
    } finally {
      setSaving(false);
    }
  }

  const sectionName = section === "hero" ? "the top of the home page" : `the ${section} section`;
  const client = businessName ?? "The client";
  const head = <>
    {crumbs}
    <XaHeadline quiet={`A draft, prepared by you. ${client} makes it live.`}>Update {sectionName}.</XaHeadline>
  </>;
  const link = fieldValue("ctaLink");
  const linkChoice = LINK_CHOICES.some(choice => choice.value === link) ? link : "other";
  const story = <>
    {status === "loading" ? <XaWorking title="Checking your website permission" steps={[{ id: "grant", label: `Reading what ${client} lets you prepare`, state: "active" }]} /> : null}
    {status === "error" ? <div role="alert"><XaEmpty pose="fixing" title="Your permission couldn't be read" job="Nothing was saved to the website." secondary={<XaTextLink onClick={() => setReload((value) => value + 1)}>Reload permission</XaTextLink>}>{message}</XaEmpty></div> : null}
    {status === "ready" && !grant ? <XaNote tone="waits">{client} needs to allow draft editing before you can update this website.</XaNote> : null}
    {status === "ready" && grant && !active ? <XaNote tone="waits">This draft permission is revoked or expired. You can&apos;t prepare or save anything. The website&apos;s history stays with {client === "The client" ? "the client" : client}.</XaNote> : null}
    {status === "ready" && grant && active && state ? <>
      <XaNote>If {client === "The client" ? "the client" : client} changes this part of the page while you work, Strelva tells you before saving.</XaNote>
      {section === "hero" ? <div className={styles.form}>
        <XaField id="managed-website-hero-headline" label="Headline" value={fieldValue("headline")} onChange={(event) => updateField("headline", event.target.value)} maxLength={10_000} required disabled={saving} />
        <XaTextArea id="managed-website-hero-subheadline" label="Supporting text" value={fieldValue("subheadline")} onChange={(event) => updateField("subheadline", event.target.value)} maxLength={10_000} rows={3} disabled={saving} />
        <XaField id="managed-website-hero-tagline" label="Tagline" value={fieldValue("tagline")} onChange={(event) => updateField("tagline", event.target.value)} maxLength={10_000} disabled={saving} />
        <div className={styles.pair}>
          <XaField id="managed-website-hero-cta-text" label="Button text" value={fieldValue("ctaText")} onChange={(event) => updateField("ctaText", event.target.value)} maxLength={10_000} required disabled={saving} />
          <XaSelect id="managed-website-hero-cta-target" label="The button opens" value={linkChoice} disabled={saving} onChange={(event) => { if (event.target.value !== "other") updateField("ctaLink", event.target.value); else updateField("ctaLink", ""); }}
            options={[...LINK_CHOICES, { value: "other", label: "Another page or address" }]} />
        </div>
        {linkChoice === "other" ? <XaField id="managed-website-hero-cta-link" label="Page or address" value={link} onChange={(event) => updateField("ctaLink", event.target.value)} maxLength={10_000} disabled={saving} placeholder="harbordental.com/insurance" /> : null}
      </div> : null}
      <XaFold summary="Every field in this part of the page">
        <XaTextArea id="managed-website-draft-json" label="All fields, as the site stores them" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} spellCheck={false}
          hint={`For fields without a box above. It stays a draft until ${client === "The client" ? "the client" : client} makes it live.`} error={!parsed ? "Something here isn't written the way the site reads it. Check the brackets and quotes." : undefined} />
      </XaFold>
      {customerWebsiteHref ? <p className={styles.quiet}><XaTextLink href={customerWebsiteHref}>Open {client === "The client" ? "the client" : client}&apos;s website editor</XaTextLink></p> : null}
    </> : null}
  </>;

  const object = status === "ready" && grant && active && state ? <XaDecision label="The draft, as visitors would see it"
    status={receipt ? <XaStatus kind="live">Draft saved</XaStatus> : <XaStatus kind="draft">Draft</XaStatus>} meta={websiteAddress ?? "Nothing changes until the client says yes"}
    yes={<div className={styles.yes}>
      {receipt ? <><XaNote role="status" tone="done">Saved. {client === "The client" ? "The client" : client} sees it on Home.</XaNote>{customerWebsiteHref ? <XaTextLink href={customerWebsiteHref}>Open it in {client === "The client" ? "the client" : client}&apos;s editor</XaTextLink> : null}</> : null}
      {message ? <XaNote role="alert" tone="down">{message}</XaNote> : null}
      <XaButton variant="primary" size="lg" block busy={saving} disabled={!parsed} onClick={() => void prepareAndRun()}>{saving ? "Saving the draft" : `Send to ${client === "The client" ? "the client" : client}`}</XaButton>
      <XaNote>Nothing on the live site changes until {client === "The client" ? "the client" : client} says yes.</XaNote>
    </div>}>
    <XaPage address={websiteAddress ?? "Home page"} flat label="The home page with your draft">
      {fieldValue("tagline") ? <p className={styles.tagline}>{fieldValue("tagline")}</p> : null}
      <p className={styles.heroTitle}>{fieldValue("headline") || "Your headline"}</p>
      {fieldValue("subheadline") ? <XaPageChange>{fieldValue("subheadline")}</XaPageChange> : null}
      {fieldValue("ctaText") ? <span className={styles.cta}>{fieldValue("ctaText")}</span> : null}
    </XaPage>
  </XaDecision> : undefined;

  return <XaObjectPage label="Prepare a website update" phone="object-first" head={head} story={story} object={object} />;
}
