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

  if (!properties || properties.length <= 1) {
    return <p className="truncate text-[13px] font-medium leading-tight text-warm-black" title={fallbackName}>{fallbackName}</p>;
  }

  return <select
    aria-label="Website"
    value={tenantId}
    className="max-w-full min-h-10 rounded-xl border border-gray-border bg-surface-raised px-3 py-2 text-[13px] text-warm-black"
    onChange={(event) => {
      const next = properties.find((property) => property.id === event.target.value);
      if (next && next.id !== tenantId) window.location.assign(next.href);
    }}
  >
    {!properties.some((property) => property.id === tenantId) && <option value={tenantId}>{fallbackName}</option>}
    {properties.map((property) => <option key={property.id} value={property.id}>{property.id === tenantId ? fallbackName : property.name}</option>)}
  </select>;
}
