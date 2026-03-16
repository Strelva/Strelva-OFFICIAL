"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import type { StoryContent } from "@/lib/types";

export default function StoryEditor() {
  const [data, setData] = useState<StoryContent | null>(null);

  useEffect(() => {
    fetch("/api/content/story").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/story", {
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
    <SectionEditor title="About Chelsea" description="Your bio, credentials, and why you started Rohlax" siteAnchor="story" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Section Label</label>
          <input
            type="text"
            value={data.sectionLabel}
            onChange={(e) => setData({ ...data, sectionLabel: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <textarea
            value={data.headline}
            onChange={(e) => setData({ ...data, headline: e.target.value })}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Accent Text</label>
          <input
            type="text"
            value={data.accentText}
            onChange={(e) => setData({ ...data, accentText: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Big Statement</label>
          <p className="text-xs mb-1.5" style={{ color: "var(--bark-faded)" }}>
            The phrase &quot;move freely&quot; will be highlighted in green.
          </p>
          <textarea
            value={data.statement}
            onChange={(e) => setData({ ...data, statement: e.target.value })}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Paragraphs"
          items={data.paragraphs}
          onChange={(paragraphs) => setData({ ...data, paragraphs })}
          createItem={() => ""}
          renderItem={(item, _index, update) => (
            <textarea
              value={item}
              onChange={(e) => update(e.target.value)}
              rows={3}
              placeholder="Write about your background, approach, or philosophy..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
            />
          )}
        />
      </div>

      <div className="bg-white p-6 rounded-xl border border-gray-200">
        <ArrayEditor
          label="Stats"
          items={data.stats}
          onChange={(stats) => setData({ ...data, stats })}
          createItem={() => ({ value: "", label: "" })}
          renderItem={(item, _index, update) => (
            <div className="grid sm:grid-cols-2 gap-4 pr-16">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Value</label>
                <input type="text" value={item.value} onChange={(e) => update({ ...item, value: e.target.value })} placeholder="e.g. 10+, 1,000+" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Label</label>
                <input type="text" value={item.label} onChange={(e) => update({ ...item, label: e.target.value })} placeholder="e.g. Years in Healthcare" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
            </div>
          )}
        />
      </div>

      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quote</label>
          <textarea value={data.quote} onChange={(e) => setData({ ...data, quote: e.target.value })} rows={2} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quote Attribution</label>
          <input type="text" value={data.quoteAttribution} onChange={(e) => setData({ ...data, quoteAttribution: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg outline-none text-sm" />
        </div>
        <ImageUploader label="Main Image" hint="Photo of Chelsea. Portrait or action shot. Recommended: 800x1000." currentUrl={data.imageUrl} onUpload={(url) => setData({ ...data, imageUrl: url })} />
      </div>
    </SectionEditor>
  );
}
