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
  XaAnswers, XaButton, XaChoices, XaDecision, XaEmpty, XaField, XaHeadline, XaInitial, XaStatus, XaTextLink, XaWorking,
} from "@/components/ui/strelva/Xa";
import { XaBlock, XaNote, XaObjectPage } from "@/experience/xa-object/XaObjectPage";
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
      const value: unknown = await response.json(); if (!response.ok) throw new Error("The locations could not be loaded. Your current organization and business memberships are required.");
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
      setNotice(input.action === "archive" ? "Archived. Its people, records and Versions are kept." : input.action === "bind_version" ? "Version attached. It grants no new access." : input.action === "put" && input.expectedRevision === 0 ? `${input.name} added.` : "Saved.");
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
      {command.current ? <XaButton variant="secondary" size="sm" disabled={pending} onClick={() => command.current && void change(command.current)}>Retry the same change</XaButton> : null}
      <XaButton variant="quiet" size="sm" disabled={pending} onClick={() => { command.current = null; setAttempt(value => value + 1); }}>Reload the locations</XaButton>
    </div>
  </div> : null;
  const notManager = !canManage ? <XaNote>Only an organization owner or administrator with current access to the business can change its locations.</XaNote> : null;

  if (!view) return <XaObjectPage story={error
    ? <><XaEmpty pose="fixing" title="The locations couldn't be read" job="Nothing changed in any location.">{error}</XaEmpty>{failure}{notManager}</>
    : <XaWorking title="Reading every location" steps={[{ id: "read", label: "Checking which businesses you can open", state: "active" }]} />} />;

  const form = mode === "add" || mode === "edit" ? <form className={styles.stack} aria-label={mode === "edit" ? `Edit ${selected?.name ?? "location"}` : "Add a location"} onSubmit={event => { event.preventDefault(); if (!pending && businessId && name.trim()) void change({ action: "put", id: mode === "edit" && selected ? selected.id : crypto.randomUUID(), organizationId, businessId, parentId: parentId || null, name: name.trim(), kind, expectedRevision: mode === "edit" && selected ? selected.revision : 0 }); }}>
    {mode === "add" ? (managed.length > 1 ? <XaChoices label="Business that owns it" value={businessId} onChange={setBusinessId} options={managed.map(b => ({ value: b.id, label: b.name }))} /> : managed[0] ? <XaNote>Owned by {managed[0].name}</XaNote> : null) : <XaNote>Owned by {businessName(businessId ?? "")}</XaNote>}
    <XaField label="Name" value={name} maxLength={160} required disabled={pending} onChange={e => setName(e.target.value)} placeholder="Elmwood" />
    <div className={styles.selectField}><label htmlFor="unit-kind">Kind</label><select id="unit-kind" value={kind} disabled={pending} onChange={e => setKind(e.target.value as Unit["kind"])}>{(Object.keys(KIND_WORD) as Unit["kind"][]).map(value => <option key={value} value={value}>{KIND_WORD[value]}</option>)}</select></div>
    <div className={styles.selectField}><label htmlFor="unit-parent">Sits under</label><select id="unit-parent" value={parentId} disabled={pending} onChange={e => setParentId(e.target.value)}><option value="">The organization itself</option>{units.filter(u => u.id !== (mode === "edit" ? selected?.id : undefined) && u.status === "active" && managed.some(b => b.id === u.businessId)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
    <div className={styles.row}>
      <XaButton type="submit" variant="primary" size="lg" busy={pending} disabled={pending || Boolean(command.current) || !businessId || !name.trim()}>{mode === "edit" ? "Save location" : "Add location"}</XaButton>
      <XaButton variant="quiet" size="lg" disabled={pending} onClick={() => setMode("view")}>Cancel</XaButton>
    </div>
  </form> : null;

  const object = !canManage && !selected ? null : form ? <XaDecision label={mode === "edit" ? "Edit a location" : "Add a location"} status={<XaStatus kind="draft">{mode === "edit" ? `Editing ${selected?.name}` : "New location"}</XaStatus>} meta="Structure grants no access" yes={null}>{form}</XaDecision>
    : selected ? <XaDecision label={selected.name} status={selected.status === "archived" ? <XaStatus kind="draft">Archived</XaStatus> : <span className={styles.objectTitle}>{selected.name}</span>}
      meta={KIND_WORD[selected.kind]} yes={null}>
      <XaAnswers labelWidth={120} rows={[
        ["Business", businessName(selected.businessId)],
        ["Sits under", selected.parentId ? units.find(u => u.id === selected.parentId)?.name ?? "A location you can't open" : "The organization itself"],
        ["Versions", selected.versionIds.length ? `${selected.versionIds.length} of this business's own` : "None attached"],
      ]} />
      {mode === "version" ? <div className={styles.stack}>
        {versions === null ? <XaWorking title="Reading this business's Versions" steps={[]} />
          : versions.filter(v => !v.assigned).length ? <XaChoices label="Attach one of this business's own Versions" value={versionId} onChange={setVersionId}
            options={versions.filter(v => !v.assigned).map(v => ({ value: v.id, label: v.name, detail: `${v.context} · from Release ${v.baselineRevision}` }))} />
            : <XaNote>This business has no other Versions to attach.</XaNote>}
        <XaNote>Attaching changes structure only. It grants no source, account or customer access.</XaNote>
        <div className={styles.row}>
          <XaButton variant="secondary" disabled={pending || !versionId} busy={pending} onClick={() => versionId && void change({ action: "bind_version", organizationId, id: selected.id, versionId, expectedRevision: selected.revision })}>Attach this Version</XaButton>
          <XaButton variant="quiet" disabled={pending} onClick={() => setMode("view")}>Cancel</XaButton>
        </div>
      </div> : canChange(selected) ? <div className={styles.row}>
        <XaButton variant="secondary" size="sm" disabled={pending} onClick={() => startEdit(selected)}>Edit <span className="sr-only">{selected.name}</span></XaButton>
        <XaButton variant="secondary" size="sm" disabled={pending} onClick={() => void chooseVersions(selected)}>Attach a Version</XaButton>
        <XaButton variant="quiet" size="sm" disabled={pending} onClick={() => void change({ action: "archive", organizationId, id: selected.id, expectedRevision: selected.revision })}>Archive <span className="sr-only">{selected.name}</span></XaButton>
      </div> : null}
    </XaDecision> : null;

  return <XaObjectPage label="Businesses and locations"
    story={<>
      <XaHeadline quiet="Each keeps its own people, accounts, records and Versions.">{units.length ? `${units.length} ${units.length === 1 ? "location" : "locations"}, one organization.` : "No locations yet."}</XaHeadline>
      {notice ? <XaNote role="status" tone="done">{notice}</XaNote> : null}
      {failure}
      {canManage && mode === "view" ? <div><XaButton variant="primary" size="lg" disabled={pending || !managed.length} onClick={startAdd}>Add a location</XaButton></div> : null}
      <XaBlock label="Every location">
        {units.length ? <ul className={styles.tree} aria-label="Business and location tree">{units.map(unit => <li key={unit.id} style={{ "--depth": depth(unit) } as CSSProperties}>
          <button type="button" className={styles.node} aria-pressed={selected?.id === unit.id && mode !== "add"} onClick={() => { setSelectedId(unit.id); setMode("view"); }}>
            <XaInitial name={unit.name} size={26} color={unit.status === "archived" ? "#a3a69f" : undefined} />
            <span className={styles.nodeText}><span className={styles.nodeName}>{unit.name}</span><span className={styles.nodeDetail}>{KIND_WORD[unit.kind]} · {businessName(unit.businessId)}</span></span>
            {unit.status === "archived" ? <span className={styles.nodeMeta}>Archived</span> : unit.versionIds.length ? <span className={styles.nodeMeta}>{unit.versionIds.length} {unit.versionIds.length === 1 ? "Version" : "Versions"}</span> : null}
          </button>
        </li>)}</ul> : <XaNote>No locations yet. {canManage ? "Add a business or location to start the tree." : "An organization owner or administrator can add one."}</XaNote>}
        <XaNote>{view.inaccessibleUnits ? `${view.inaccessibleUnits} ${view.inaccessibleUnits === 1 ? "location is" : "locations are"} unavailable to your account. Their names and records are left out.` : "You can see every location in this organization."} Structure grants no access.</XaNote>
      </XaBlock>
      {notManager}
      <p className={styles.quiet}><XaTextLink href={`/workspace/access-review?workspaceId=${encodeURIComponent(organizationId)}`}>Review People & access</XaTextLink></p>
    </>}
    object={object ?? undefined} />;
}
