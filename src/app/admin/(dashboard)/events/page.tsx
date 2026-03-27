"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { EventsContent, EventItem } from "@/lib/types";

function isPastEvent(dateStr: string): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") < today;
}

export default function EventsEditor() {
  const [data, setData] = useState<EventsContent | null>(null);

  useEffect(() => {
    fetch("/api/content/events", { credentials: "same-origin" }).then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Server error");
    }
  };

  if (!data) return (
    <div className="animate-pulse space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
        <div className="h-10 bg-gray-100 rounded-lg" />
      </div>
      <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-50 rounded-lg border border-gray-100" />
        ))}
      </div>
    </div>
  );

  return (
    <SectionEditor title="Events" description="Upcoming events, workshops, and community happenings" siteAnchor="events" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <input type="text" value={data.headline} onChange={(e) => setData({ ...data, headline: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Events"
          items={data.events}
          onChange={(events) => setData({ ...data, events })}
          requiredField="title"
          createItem={(): EventItem => ({
            id: `event-${Date.now()}`,
            title: "",
            date: "",
            time: "",
            location: "",
            description: "",
            hosted_by: "owner",
            external_link: "",
            image_url: "",
          })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              {isPastEvent(item.date) && (
                <div className="px-3 py-2 rounded text-xs font-medium" style={{ background: "rgba(181,99,75,0.1)", color: "var(--terra)" }}>
                  This event is in the past and won&apos;t appear on the site.
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Title <span className="text-red-400">*</span></label>
                <input type="text" value={item.title} onChange={(e) => update({ ...item, title: e.target.value })} placeholder="Event name" className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${item.title.trim() === "" ? "border-red-300 bg-red-50/50" : "border-gray-200"}`} />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={item.date} onChange={(e) => update({ ...item, date: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input type="text" value={item.time} onChange={(e) => update({ ...item, time: e.target.value })} placeholder="e.g. 6:00 PM - 8:00 PM" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Hosted By</label>
                  <select value={item.hosted_by} onChange={(e) => update({ ...item, hosted_by: e.target.value as EventItem["hosted_by"] })} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm">
                    <option value="owner">Owner</option>
                    <option value="partner">Partner</option>
                    <option value="community">Community</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Location</label>
                <input type="text" value={item.location} onChange={(e) => update({ ...item, location: e.target.value })} placeholder="Venue or address" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea value={item.description} onChange={(e) => update({ ...item, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <ImageUploader
                currentUrl={item.image_url || ""}
                onUpload={(url) => update({ ...item, image_url: url })}
                label="Event Photo"
                hint="Flyer, venue photo, or past event image"
              />
              <div>
                <label className="block text-xs text-gray-500 mb-1">External Link</label>
                <input type="text" value={item.external_link} onChange={(e) => update({ ...item, external_link: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--bark-faded)" }}>Link to event page, registration, or more details</p>
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
