"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import type { ProvidersContent, ProviderItem } from "@/lib/types";

export default function ProvidersEditor() {
  const [data, setData] = useState<ProvidersContent | null>(null);

  useEffect(() => {
    fetch("/api/content/providers").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/providers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Server error");
    }
  };

  if (!data) return <div className="text-gray-400">Loading...</div>;

  return (
    <SectionEditor title="Providers" description="Recommended wellness providers in Chelsea's network" siteAnchor="providers" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <input type="text" value={data.headline} onChange={(e) => setData({ ...data, headline: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={data.description} onChange={(e) => setData({ ...data, description: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Providers"
          items={data.providers}
          onChange={(providers) => setData({ ...data, providers })}
          createItem={(): ProviderItem => ({
            id: `provider-${Date.now()}`,
            name: "",
            category: "massage",
            service: "",
            why_i_recommend: "",
            booking_link: "",
            phone: "",
            photo_url: "",
          })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input type="text" value={item.name} onChange={(e) => update({ ...item, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select value={item.category} onChange={(e) => update({ ...item, category: e.target.value as ProviderItem["category"] })} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm">
                    <option value="massage">Massage</option>
                    <option value="chiropractic">Chiropractic</option>
                    <option value="yoga">Yoga</option>
                    <option value="fitness">Fitness</option>
                    <option value="specialty">Specialty</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Service</label>
                <input type="text" value={item.service} onChange={(e) => update({ ...item, service: e.target.value })} placeholder="e.g. Deep Tissue Massage" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Why I Recommend</label>
                <textarea value={item.why_i_recommend} onChange={(e) => update({ ...item, why_i_recommend: e.target.value })} rows={2} placeholder="Chelsea's personal recommendation..." className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Booking Link</label>
                  <input type="text" value={item.booking_link} onChange={(e) => update({ ...item, booking_link: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input type="text" value={item.phone} onChange={(e) => update({ ...item, phone: e.target.value })} placeholder="(716) 555-0000" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
