"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import type { ContactContent } from "@/lib/types";

export default function ContactEditor() {
  const [data, setData] = useState<ContactContent | null>(null);

  useEffect(() => {
    fetch("/api/content/contact").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/contact", {
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
    <SectionEditor title="Contact" description="How clients reach you" siteAnchor="contact" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="text" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="(716) 555-0000" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input type="text" value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
          <p className="text-xs mb-1.5" style={{ color: "var(--bark-faded)" }}>Use Enter for line breaks between days</p>
          <textarea value={data.hours} onChange={(e) => setData({ ...data, hours: e.target.value })} rows={4} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location Title</label>
          <textarea value={data.locationTitle} onChange={(e) => setData({ ...data, locationTitle: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location Description</label>
          <textarea value={data.locationDescription} onChange={(e) => setData({ ...data, locationDescription: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram URL</label>
          <input type="url" value={data.instagramUrl} onChange={(e) => setData({ ...data, instagramUrl: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Facebook URL</label>
          <input type="url" value={data.facebookUrl} onChange={(e) => setData({ ...data, facebookUrl: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Google Maps Embed URL</label>
          <p className="text-xs mb-1.5" style={{ color: "var(--bark-faded)" }}>
            Paste the embed URL from Google Maps (Share → Embed a map → copy the src URL)
          </p>
          <input type="text" value={data.googleMapsUrl} onChange={(e) => setData({ ...data, googleMapsUrl: e.target.value })} placeholder="https://www.google.com/maps/embed?..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
      </div>
    </SectionEditor>
  );
}
