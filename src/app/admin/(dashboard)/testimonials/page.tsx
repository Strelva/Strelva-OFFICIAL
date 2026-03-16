"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import type { TestimonialsContent, TestimonialItem } from "@/lib/types";

export default function TestimonialsEditor() {
  const [data, setData] = useState<TestimonialsContent | null>(null);

  useEffect(() => {
    fetch("/api/content/testimonials").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/testimonials", {
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
    <SectionEditor title="Testimonials" description="Client quotes — builds trust and social proof" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <input type="text" value={data.headline} onChange={(e) => setData({ ...data, headline: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Testimonials"
          items={data.testimonials}
          onChange={(testimonials) => setData({ ...data, testimonials })}
          createItem={(): TestimonialItem => ({ id: `t-${Date.now()}`, quote: "", author: "", location: "" })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quote</label>
                <textarea value={item.quote} onChange={(e) => update({ ...item, quote: e.target.value })} rows={3} placeholder="What did the client say?" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Author</label>
                  <input type="text" value={item.author} onChange={(e) => update({ ...item, author: e.target.value })} placeholder="e.g. Jessica M." className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location</label>
                  <input type="text" value={item.location} onChange={(e) => update({ ...item, location: e.target.value })} placeholder="e.g. Buffalo, NY" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
