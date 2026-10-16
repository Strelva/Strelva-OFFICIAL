"use client";

import { useEffect, useState } from "react";
import { useDashboard } from "./DashboardContext";

type Property = { id: string; name: string; href: string };

/** Select among server-authorized websites. A single website remains plain context. */
export function PropertySwitcher({ fallbackName }: { fallbackName: string }) {
  const { tenantId, dashboardHref } = useDashboard();
  const [properties, setProperties] = useState<Property[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(dashboardHref("/api/my-properties"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load websites");
        return response.json();
      })
      .then((data) => { if (!controller.signal.aborted) setProperties(Array.isArray(data.properties) ? data.properties : []); })
      .catch(() => { if (!controller.signal.aborted) setProperties([]); });
    return () => controller.abort();
  }, [dashboardHref]);

  // One website: the sidebar and phone header already name it, so the switcher says nothing.
  if (!properties || properties.length <= 1) return null;

  return <select
    aria-label="Website"
    value={tenantId}
    className="max-w-full min-h-10 rounded-full border-0 bg-[var(--st-surface)] px-4 py-2 text-[14px] text-[var(--st-text)] shadow-[0_1px_2px_#0000000f]"
    onChange={(event) => {
      const next = properties.find((property) => property.id === event.target.value);
      if (next && next.id !== tenantId) window.location.assign(next.href);
    }}
  >
    {!properties.some((property) => property.id === tenantId) && <option value={tenantId}>{fallbackName}</option>}
    {properties.map((property) => <option key={property.id} value={property.id}>{property.id === tenantId ? fallbackName : property.name}</option>)}
  </select>;
}
