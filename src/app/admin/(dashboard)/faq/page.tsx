"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import type { FaqContent, FaqItem } from "@/lib/types";

export default function FaqEditor() {
  const [data, setData] = useState<FaqContent | null>(null);

  useEffect(() => {
    fetch("/api/content/faq", { credentials: "same-origin" }).then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/faq", {
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
    <SectionEditor title="FAQ" description="Frequently asked questions shown on the FAQ page" siteAnchor="faq" onSave={save}>
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
          label="Questions"
          items={data.faqs}
          onChange={(faqs) => setData({ ...data, faqs })}
          requiredField="question"
          createItem={(): FaqItem => ({
            id: `faq-${Date.now()}`,
            question: "",
            answer: "",
          })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Question <span className="text-red-400">*</span></label>
                <input type="text" value={item.question} onChange={(e) => update({ ...item, question: e.target.value })} placeholder="e.g. What should I wear?" className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${item.question.trim() === "" ? "border-red-300 bg-red-50/50" : "border-gray-200"}`} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Answer <span className="text-red-400">*</span></label>
                <textarea value={item.answer} onChange={(e) => update({ ...item, answer: e.target.value })} rows={3} placeholder="Write a helpful answer..." className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${item.answer.trim() === "" ? "border-red-300 bg-red-50/50" : "border-gray-200"}`} />
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
