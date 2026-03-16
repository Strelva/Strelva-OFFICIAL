"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import type { ServicesContent, ServiceItem } from "@/lib/types";

export default function ServicesEditor() {
  const [data, setData] = useState<ServicesContent | null>(null);

  useEffect(() => {
    fetch("/api/content/services").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/services", {
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
    <SectionEditor title="Services" description="Session types, pricing, and Vagaro booking links" siteAnchor="services" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <input
            type="text"
            value={data.headline}
            onChange={(e) => setData({ ...data, headline: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Services"
          items={data.services}
          onChange={(services) => setData({ ...data, services })}
          createItem={(): ServiceItem => ({
            id: `service-${Date.now()}`,
            name: "",
            description: "",
            duration: "",
            price: "",
            featured: false,
            who_its_for: "",
            vagaro_link: "",
            comingSoon: false,
          })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => update({ ...item, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Duration</label>
                    <input
                      type="text"
                      value={item.duration}
                      onChange={(e) => update({ ...item, duration: e.target.value })}
                      placeholder="e.g. 50 min"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Price</label>
                    <input
                      type="text"
                      value={item.price}
                      onChange={(e) => update({ ...item, price: e.target.value })}
                      placeholder="e.g. 85"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea
                  value={item.description}
                  onChange={(e) => update({ ...item, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Best For</label>
                <input
                  type="text"
                  value={item.who_its_for}
                  onChange={(e) => update({ ...item, who_its_for: e.target.value })}
                  placeholder="Who is this session ideal for?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vagaro Booking Link</label>
                <input
                  type="text"
                  value={item.vagaro_link}
                  onChange={(e) => update({ ...item, vagaro_link: e.target.value })}
                  placeholder="https://www.vagaro.com/..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
                />
                <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--bark-faded)" }}>
                  Direct link to book this specific service on Vagaro
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.featured}
                    onChange={(e) => update({ ...item, featured: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs text-gray-500">Featured service</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.comingSoon}
                    onChange={(e) => update({ ...item, comingSoon: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs text-gray-500">Coming Soon</label>
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
