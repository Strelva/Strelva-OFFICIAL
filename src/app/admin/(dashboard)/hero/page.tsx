"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { HeroContent } from "@/lib/types";

export default function HeroEditor() {
  const [data, setData] = useState<HeroContent | null>(null);

  useEffect(() => {
    fetch("/api/content/hero").then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/hero", {
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

  const update = (field: keyof HeroContent, value: string) =>
    setData({ ...data, [field]: value });

  return (
    <SectionEditor title="Hero Section" description="The first thing visitors see" siteAnchor="hero" onSave={save}>
      <div className="grid gap-6 bg-white p-6 rounded-xl border border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <p className="text-xs mb-1.5" style={{ color: "var(--bark-faded)" }}>
            Use Enter for line breaks. &quot;Release. Restore. ROHLAX.&quot;
          </p>
          <textarea
            value={data.headline}
            onChange={(e) => update("headline", e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subheadline</label>
          <p className="text-xs mb-1.5" style={{ color: "var(--bark-faded)" }}>
            Small text above the headline, e.g. &quot;Assisted Stretching in Buffalo, NY&quot;
          </p>
          <input
            type="text"
            value={data.subheadline}
            onChange={(e) => update("subheadline", e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
          <textarea
            value={data.tagline}
            onChange={(e) => update("tagline", e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Button Text</label>
            <input
              type="text"
              value={data.ctaText}
              onChange={(e) => update("ctaText", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Button Link</label>
            <input
              type="text"
              value={data.ctaLink}
              onChange={(e) => update("ctaLink", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-sage/20 focus:border-sage outline-none text-sm"
            />
          </div>
        </div>
        <ImageUploader
          label="Background Image"
          hint="Full-screen hero photo. Wellness/stretching imagery. Recommended: 1920x1080+."
          currentUrl={data.backgroundImageUrl}
          onUpload={(url) => update("backgroundImageUrl", url)}
        />
      </div>
    </SectionEditor>
  );
}
