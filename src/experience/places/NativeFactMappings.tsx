"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput } from "@/components/ui/TextInput";
import { nativeFactFields, nativeServiceFields, nativeFactMappingInputSchema, type NativeFactMapping, type NativeFactMappingInput } from "@/products/websites/client";

const endpoint = "/api/workspace/business-details/native-mapping";
const factLabels = { display_name: "Business name", phone: "Phone", email: "Public email", address: "Address", hours: "Hours and dated exceptions" };
const serviceLabels = { name: "Name", description: "Description", priceText: "Price", durationMinutes: "Duration" };
type ServiceChoice = { id: string; name: string };
type MappingData = { mapping: NativeFactMapping; availableFields?: NativeFactMappingInput["fields"]; nativeServices: ServiceChoice[]; businessServices: ServiceChoice[] };

function mappingValue(value: unknown): NativeFactMapping {
  const candidate = value as NativeFactMapping | null;
  const parsed = nativeFactMappingInputSchema.safeParse(candidate && { fields: candidate.fields, services: candidate.services });
  if (!parsed.success || !candidate || !Number.isInteger(candidate.revision) || candidate.revision < 0) throw new Error("Website fact settings could not be confirmed. Your choices are kept.");
  return { ...parsed.data, revision: candidate.revision };
}

/** Only explicit UUID-to-native-ID choices establish a service mapping. */
export function NativeFactMappings({ workspaceId, sites, readOnly = false, request = fetch }: {
  workspaceId: string; sites: Array<{ tenantId: string; siteName: string }>; readOnly?: boolean; request?: typeof fetch;
}) {
  const [tenantId, setTenantId] = useState("");
  if (readOnly) return null;
  return <section aria-label="Website fact settings" className="grid gap-4">
    <p className="text-sm text-gray-muted">Choose which business facts can prepare changes for each website. Saving these settings applies to future fact changes. Website drafts still need review before they go live.</p>
    {!sites.length ? <p className="text-sm text-gray-muted">No native website is available for these settings.</p> : <>
      <SelectInput label="Website to configure" value={tenantId} options={[{ value: "", label: "Choose a website" }, ...sites.map(site => ({ value: site.tenantId, label: site.siteName }))]} onChange={event => setTenantId(event.target.value)} />
      {tenantId ? <MappingEditor key={`${workspaceId}:${tenantId}`} workspaceId={workspaceId} tenantId={tenantId} request={request} /> : null}
    </>}
  </section>;
}

function MappingEditor({ workspaceId, tenantId, request }: { workspaceId: string; tenantId: string; request: typeof fetch }) {
  const [data, setData] = useState<MappingData>();
  const [mapping, setMapping] = useState<NativeFactMappingInput>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await request(`${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}&tenantId=${encodeURIComponent(tenantId)}`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Website fact settings could not load.");
        const accepted = mappingValue(result.mapping);
        if (!Array.isArray(result.nativeServices) || !Array.isArray(result.businessServices)) throw new Error("Available services could not be read.");
        if (controller.signal.aborted) return;
        setData({ mapping: accepted, availableFields: Array.isArray(result.availableFields) ? result.availableFields.filter((field: unknown) => nativeFactFields.includes(field as typeof nativeFactFields[number])) : undefined, nativeServices: result.nativeServices, businessServices: result.businessServices });
        setMapping({ fields: accepted.fields, services: accepted.services }); setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Website fact settings could not load.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { active.current = false; controller.abort(); };
  }, [workspaceId, tenantId, request, loadAttempt]);

  function change(next: NativeFactMappingInput) { setMapping(next); setSaved(false); }
  function changeService(index: number, update: Partial<NativeFactMappingInput["services"][number]>) {
    if (mapping) change({ ...mapping, services: mapping.services.map((service, i) => i === index ? { ...service, ...update } : service) });
  }
  async function save() {
    if (inFlight.current || !mapping || !data) return;
    const parsed = nativeFactMappingInputSchema.safeParse(mapping);
    if (!parsed.success) { setError("Choose one business service, one website service and at least one field for each pair. Each service can appear only once."); return; }
    if (parsed.data.services.some(service => !data.businessServices.some(option => option.id === service.serviceId) || !data.nativeServices.some(option => option.id === service.nativeServiceId))) {
      setError("One selected service is no longer available. Choose an available service before saving."); return;
    }
    if (JSON.stringify(parsed.data) === JSON.stringify({ fields: data.mapping.fields, services: data.mapping.services })) { setSaved(true); setError(""); return; }
    inFlight.current = true; setBusy(true); setSaved(false); setError("");
    try {
      const response = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, tenantId, revision: data.mapping.revision, mapping: parsed.data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Website fact settings could not be saved. Your choices are kept.");
      const accepted = mappingValue(result.mapping);
      if (!active.current) return;
      setData({ ...data, mapping: accepted }); setMapping({ fields: accepted.fields, services: accepted.services }); setSaved(true);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : "Website fact settings could not be saved. Your choices are kept."); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }

  if (loading) return <p role="status" className="text-sm text-gray-muted">Loading website fact settings…</p>;
  if (!data || !mapping) return <div className="grid gap-3"><p role="alert" className="text-sm">{error}</p><Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(""); setLoadAttempt(value => value + 1); }}>Try again</Button></div>;
  const options = (choices: ServiceChoice[], selected: string, label: string) => [
    { value: "", label },
    ...(selected && !choices.some(choice => choice.id === selected) ? [{ value: selected, label: "Previously selected service is unavailable" }] : []),
    ...choices.map(choice => ({ value: choice.id, label: `${choice.name} (${choice.id})` })),
  ];
  return <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset className="grid gap-1" disabled={busy}><legend className="mb-2 text-sm font-medium">Business facts to use</legend>
      {data.availableFields?.length === 0 ? <p className="text-sm text-gray-muted">No business detail fields are available on this website.</p> : null}
      {(data.availableFields ?? nativeFactFields).map(field => <label key={field} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={mapping.fields.includes(field)} onChange={event => change({ ...mapping, fields: event.target.checked ? [...mapping.fields, field] : mapping.fields.filter(value => value !== field) })} />{factLabels[field]}</label>)}
    </fieldset>
    <fieldset className="grid gap-4" disabled={busy}><legend className="mb-2 text-sm font-medium">Service pairs</legend>
      {!mapping.services.length ? <p className="text-sm text-gray-muted">No services are paired. Website services keep their current content.</p> : null}
      {mapping.services.map((service, index) => <div key={index} className="grid gap-3 border-t border-gray-border pt-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectInput label={`Business service ${index + 1}`} required value={service.serviceId} options={options(data.businessServices, service.serviceId, "Choose a business service")} onChange={event => changeService(index, { serviceId: event.target.value })} />
          <SelectInput label={`Website service ${index + 1}`} required value={service.nativeServiceId} options={options(data.nativeServices, service.nativeServiceId, "Choose a website service")} onChange={event => changeService(index, { nativeServiceId: event.target.value })} />
        </div>
        <fieldset className="grid gap-1 sm:grid-cols-2"><legend className="mb-2 text-sm">Fields to use for service pair {index + 1}</legend>
          {nativeServiceFields.map(field => <label key={field} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={service.fields.includes(field)} onChange={event => changeService(index, { fields: event.target.checked ? [...service.fields, field] : service.fields.filter(value => value !== field) })} />{serviceLabels[field]}</label>)}
        </fieldset>
        <Button type="button" variant="ghost" onClick={() => change({ ...mapping, services: mapping.services.filter((_, i) => i !== index) })}>Remove service pair {index + 1}</Button>
      </div>)}
      <Button type="button" variant="secondary" disabled={!data.businessServices.length || !data.nativeServices.length || mapping.services.length >= 200} onClick={() => change({ ...mapping, services: [...mapping.services, { serviceId: "", nativeServiceId: "", fields: [] }] })}>Pair a service</Button>
      {!data.businessServices.length || !data.nativeServices.length ? <p className="text-sm text-gray-muted">Both the business record and website need a service before you can pair them.</p> : null}
    </fieldset>
    <p className="text-sm text-gray-muted">Website service IDs, booking settings, images and other content stay unchanged.</p>
    <Button type="submit" loading={busy}>Save website fact settings</Button>
    {error ? <p role="alert" className="text-sm">{error}</p> : null}
    {saved ? <p role="status" className="text-sm">Website fact settings saved. They apply when you next change those facts. Nothing was published.</p> : null}
  </form>;
}
