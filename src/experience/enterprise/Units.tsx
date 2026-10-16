"use client";
/**
 * Businesses and locations under one organization (XA, lane xs-apps-care).
 * Story: the organization's tree, indented the way it is structured. Object:
 * the location you picked, edited in place, with its Versions; or a new
 * location. Structure never grants access. Commands, revisions and the
 * retry-the-same-change path are the existing /api/workspace/units.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  XaButton, XaChoices, XaDecision, XaEmpty, XaField, XaHeadline, XaSelect, XaStatus, XaTextLink, XaWorking,
} from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/components/ui/strelva/Xa";
import { unitVersionChoicesSchema, unitsViewSchema, type Unit, type UnitCommand, type UnitsView } from "@/platform/enterprise/contracts";
import styles from "./units.module.css";

type Business = { id: string; name: string; role?: string };
type VersionChoice = { id: string; name: string; context: string; baselineRevision: number; assigned: boolean };
const KIND_WORD: Record<Unit["kind"], string> = { business: "Business", location: "Location", division: "Division", franchise: "Franchise" };

export function Units({ organizationId, businesses, canManage, request }: { organizationId: string; businesses: Business[]; canManage: boolean; request?: typeof fetch }) {
  return <UnitsLoader key={organizationId} organizationId={organizationId} businesses={businesses} canManage={canManage} request={request} />;
}

function UnitsLoader({ organizationId, businesses, canManage, request }: { organizationId: string; businesses: Business[]; canManage: boolean; request?: typeof fetch }) {
  const [view, setView] = useState<UnitsView | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [attempt, setAttempt] = useState(0), [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"view" | "add" | "edit" | "version">("view"), [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState(""), [businessId, setBusinessId] = useState<string | null>(null), [parentId, setParentId] = useState<string>(""), [kind, setKind] = useState<Unit["kind"]>("location");
  const [versions, setVersions] = useState<VersionChoice[] | null>(null), [versionId, setVersionId] = useState<string | null>(null);
  const command = useRef<UnitCommand | null>(null), inflight = useRef(false);
  const send = (input: string, init?: RequestInit) => (request ?? fetch)(input, init);
  useEffect(() => {
    const controller = new AbortController();
    void send(`/api/workspace/units?organizationId=${encodeURIComponent(organizationId)}`, { credentials: "same-origin", signal: controller.signal }).then(async response => {
      const value: unknown = await response.json(); if (!response.ok) throw new Error("The locations couldn't be opened for your account.");
      const result = unitsViewSchema.parse(value); if (result.organizationId !== organizationId) throw new Error("The organization changed.");
      if (!controller.signal.aborted) { setView(result); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Locations are unavailable."); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, attempt]);
  async function change(input: UnitCommand) {
    if (inflight.current) return; inflight.current = true; setPending(true); setError(""); command.current = input;
    try {
      const response = await send("/api/workspace/units", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const value: unknown = await response.json();
      if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The change could not be confirmed. Reload the locations before trying again.");
      command.current = null;
      setNotice(input.action === "archive" ? "Archived. Its people, records and Versions are kept." : input.action === "bind_version" ? "Version attached." : input.action === "put" && input.expectedRevision === 0 ? `${input.name} added.` : "Saved.");
      setAttempt(value => value + 1); setName(""); setMode("view"); setVersions(null); setVersionId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be confirmed."); }
    finally { inflight.current = false; setPending(false); }
  }
  async function chooseVersions(unit: Unit) {
    setMode("version"); setVersions(null); setVersionId(null); setError("");
    try { const response = await send(`/api/workspace/units?${new URLSearchParams({ organizationId, unitId: unit.id })}`, { credentials: "same-origin" }); if (!response.ok) throw new Error("This business's Versions could not be loaded."); const value = unitVersionChoicesSchema.parse(await response.json()); if (value.unitId !== unit.id || value.businessId !== unit.businessId) throw new Error("The location changed."); setVersions(value.versions); } catch (cause) { setError(cause instanceof Error ? cause.message : "Versions unavailable."); setVersions([]); }
  }
  function depth(unit: Unit) { const seen = new Set<string>(); let current: Unit | undefined = unit; while (current?.parentId && !seen.has(current.parentId)) { seen.add(current.parentId); current = view?.units.find(item => item.id === current?.parentId); } return Math.min(seen.size, 6); }
  const managed = businesses.filter(b => b.role === "owner" || b.role === "admin");
  const units = view?.units ?? [];
  const selected = units.find(unit => unit.id === selectedId) ?? units[0] ?? null;
  const canChange = (unit: Unit) => canManage && managed.some(b => b.id === unit.businessId) && unit.status === "active";
  const businessName = (id: string) => businesses.find(b => b.id === id)?.name ?? "A business you can't open";
  const startEdit = (unit: Unit) => { setSelectedId(unit.id); setMode("edit"); setName(unit.name); setBusinessId(unit.businessId); setKind(unit.kind); setParentId(unit.parentId ?? ""); };
  const startAdd = () => { setMode("add"); setName(""); setBusinessId(managed.length === 1 ? managed[0]!.id : null); setKind("location"); setParentId(""); };

  const failure = error ? <div role="alert" className={styles.stack}>
    <XaNote tone="down">{error}</XaNote>
    <div className={styles.row}>
      {command.current ? <XaButton variant="secondary" size="sm" disabled={pending} onClick={() => command.current && void change(command.current)}>Send the same change again</XaButton> : null}
      <XaButton variant="quiet" size="sm" disabled={pending} onClick={() => { command.current = null; setAttempt(value => value + 1); }}>Check again</XaButton>
    </div>
  </div> : null;
  const notManager = !canManage ? <XaNote>You can look. The owner changes locations.</XaNote> : null;

  if (!view) return <XaObjectPage story={error
    ? <><XaEmpty pose="fixing" title="The locations couldn't be read" job="Nothing changed in any location.">{error}</XaEmpty>{failure}{notManager}</>
    : <XaWorking title="Reading every location" steps={[{ id: "read", label: "Checking which businesses you can open", state: "active" }]} />} />;

  const form = mode === "add" || mode === "edit" ? <form className={styles.stack} aria-label={mode === "edit" ? `Edit ${selected?.name ?? "location"}` : "Add a location"} onSubmit={event => { event.preventDefault(); if (!pending && businessId && name.trim()) void change({ action: "put", id: mode === "edit" && selected ? selected.id : crypto.randomUUID(), organizationId, businessId, parentId: parentId || null, name: name.trim(), kind, expectedRevision: mode === "edit" && selected ? selected.revision : 0 }); }}>
    {mode === "add" ? (managed.length > 1 ? <XaChoices label="Business that owns it" value={businessId} onChange={setBusinessId} options={managed.map(b => ({ value: b.id, label: b.name }))} /> : managed[0] ? <XaNote>Owned by {managed[0].name}</XaNote> : null) : <XaNote>Owned by {businessName(businessId ?? "")}</XaNote>}
    <XaField label="Name" value={name} maxLength={160} required disabled={pending} onChange={e => setName(e.target.value)} placeholder="Elmwood" />
    <XaSelect label="It's a" value={kind} disabled={pending} onChange={e => setKind(e.target.value as Unit["kind"])} options={(Object.keys(KIND_WORD) as Unit["kind"][]).map(value => ({ value, label: KIND_WORD[value].toLowerCase() }))} />
    <XaSelect label="Under" value={parentId} disabled={pending} onChange={e => setParentId(e.target.value)} options={[{ value: "", label: "Nothing, it's at the top" }, ...units.filter(u => u.id !== (mode === "edit" ? selected?.id : undefined) && u.status === "active" && managed.some(b => b.id === u.businessId)).map(u => ({ value: u.id, label: u.name }))]} />
    <div className={styles.row}>
      <XaButton type="submit" variant="primary" size="lg" busy={pending} disabled={pending || Boolean(command.current) || !businessId || !name.trim()}>{mode === "edit" ? "Save location" : "Add location"}</XaButton>
      <XaTextLink onClick={() => setMode("view")}>Not now</XaTextLink>
    </div>
  </form> : null;

  const object = !canManage && !selected ? null : form ? <XaDecision label={mode === "edit" ? "Edit a location" : "Add a location"} status={<XaStatus kind="draft">{mode === "edit" ? `Editing ${selected?.name}` : "New location"}</XaStatus>} yes={null}>{form}</XaDecision>
    : selected ? <XaDecision label={selected.name} status={selected.status === "archived" ? <XaStatus kind="draft">Archived</XaStatus> : <span className={styles.objectTitle}>{selected.name}</span>}
      meta={KIND_WORD[selected.kind]} yes={null}>
      <p className={styles.objectLine}>Part of {businessName(selected.businessId)}{selected.parentId ? `, under ${units.find(u => u.id === selected.parentId)?.name ?? "a location you can't open"}` : ""}. {selected.versionIds.length ? `Uses ${selected.versionIds.length} of its ${selected.versionIds.length === 1 ? "Version" : "Versions"}.` : "No Versions attached yet."}</p>
      {mode === "version" ? <div className={styles.stack}>
        {versions === null ? <XaWorking title="Reading this business's Versions" steps={[]} />
          : versions.filter(v => !v.assigned).length ? <XaChoices label="Attach one of this business's own Versions" value={versionId} onChange={setVersionId}
            options={versions.filter(v => !v.assigned).map(v => ({ value: v.id, label: v.name, detail: `${v.context} · from Release ${v.baselineRevision}` }))} />
            : <XaNote>This business has no other Versions to attach.</XaNote>}
        <XaNote>Attaching doesn&apos;t give anyone new access.</XaNote>
        <div className={styles.row}>
          <XaButton variant="secondary" disabled={pending || !versionId} busy={pending} onClick={() => versionId && void change({ action: "bind_version", organizationId, id: selected.id, versionId, expectedRevision: selected.revision })}>Attach this Version</XaButton>
          <XaTextLink onClick={() => setMode("view")}>Not now</XaTextLink>
        </div>
      </div> : canChange(selected) ? <p className={styles.links}>
        <XaTextLink onClick={() => startEdit(selected)} aria-label={`Rename or move ${selected.name}`}>Rename or move</XaTextLink><span aria-hidden="true">·</span>
        <XaTextLink onClick={() => void chooseVersions(selected)}>Attach a Version</XaTextLink><span aria-hidden="true">·</span>
        <XaTextLink onClick={() => void change({ action: "archive", organizationId, id: selected.id, expectedRevision: selected.revision })} aria-label={`Archive ${selected.name}`}>Archive</XaTextLink>
      </p> : null}
    </XaDecision> : null;

  const parentBusiness = (unit: Unit) => units.find(item => item.id === unit.parentId)?.businessId;
  // A row says only what differs: a kind other than location, its own business, archived, Versions.
  const rowDetail = (unit: Unit) => [unit.kind !== "location" ? KIND_WORD[unit.kind] : null, unit.parentId && parentBusiness(unit) !== unit.businessId ? businessName(unit.businessId) : null].filter(Boolean).join(" · ");
  const opened = mode !== "view" || selectedId !== null;
  return <XaObjectPage label="Businesses and locations" phone="push" open={opened} backLabel="Every location" onBack={() => { setSelectedId(null); setMode("view"); }}
    head={<XaHeadline quiet="Each keeps its own people, accounts and records.">{units.length ? `${units.length} ${units.length === 1 ? "place" : "places"}, one organization.` : "No locations yet."}</XaHeadline>}
    story={<>
      {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
      {failure}
      <XaBlock label="Every location" action={canManage && mode === "view" && managed.length ? <XaButton variant="primary" size="sm" disabled={pending} onClick={startAdd}>Add a location</XaButton> : undefined}>
        {units.length ? <ul className={styles.tree} aria-label="Businesses and locations">{units.map(unit => <li key={unit.id} style={{ "--depth": depth(unit) } as CSSProperties}>
          <button type="button" className={styles.node} aria-pressed={selected?.id === unit.id && mode !== "add"} data-archived={unit.status === "archived" || undefined} onClick={() => { setSelectedId(unit.id); setMode("view"); }}>
            <span className={styles.nodeText}><span className={styles.nodeName}>{unit.name}</span>{rowDetail(unit) ? <span className={styles.nodeDetail}>{rowDetail(unit)}</span> : null}</span>
            {unit.status === "archived" ? <span className={styles.nodeMeta}>Archived</span> : unit.versionIds.length ? <span className={styles.nodeMeta}>{unit.versionIds.length} {unit.versionIds.length === 1 ? "Version" : "Versions"}</span> : null}
          </button>
        </li>)}</ul> : <XaNote>No locations yet. {canManage ? "Add the first one." : "The owner adds them."}</XaNote>}
        {view.inaccessibleUnits ? <XaNote>You can&apos;t see {view.inaccessibleUnits === 1 ? "one location" : `${view.inaccessibleUnits} locations`}. Ask the owner to add you.</XaNote> : null}
      </XaBlock>
      {notManager}
      <p className={styles.quiet}><XaTextLink href={`/workspace/access-review?workspaceId=${encodeURIComponent(organizationId)}`}>Who can open what</XaTextLink></p>
    </>}
    object={object ?? undefined} />;
}
