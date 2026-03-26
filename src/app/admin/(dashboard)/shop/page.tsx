"use client";

import { useState, useEffect } from "react";
import { SectionEditor } from "@/components/admin/SectionEditor";
import { ArrayEditor } from "@/components/admin/ArrayEditor";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { ShopContent, ShopItem } from "@/lib/types";

export default function ShopEditor() {
  const [data, setData] = useState<ShopContent | null>(null);

  useEffect(() => {
    fetch("/api/content/shop", { credentials: "same-origin" }).then((r) => r.json()).then(setData);
  }, []);

  const save = async () => {
    const res = await fetch("/api/content/shop", {
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
    <SectionEditor title="Shop" description="Products, merch, and tools shown on the Shop page" siteAnchor="shop" onSave={save}>
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
          label="Products"
          items={data.items}
          onChange={(items) => setData({ ...data, items })}
          requiredField="name"
          createItem={(): ShopItem => ({
            id: `shop-${Date.now()}`,
            name: "",
            description: "",
            category: "recommended",
            price: "",
            external_link: "",
            image_url: "",
          })}
          renderItem={(item, _index, update) => (
            <div className="grid gap-4 pr-16">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-400">*</span></label>
                  <input type="text" value={item.name} onChange={(e) => update({ ...item, name: e.target.value })} placeholder="Product name" className={`w-full px-3 py-2 border rounded-lg outline-none text-sm ${item.name.trim() === "" ? "border-red-300 bg-red-50/50" : "border-gray-200"}`} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select value={item.category} onChange={(e) => update({ ...item, category: e.target.value as ShopItem["category"] })} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm">
                    <option value="recommended">Recommended</option>
                    <option value="merch">Merch</option>
                    <option value="tools">Tools</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea value={item.description} onChange={(e) => update({ ...item, description: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price</label>
                  <input type="text" value={item.price} onChange={(e) => update({ ...item, price: e.target.value })} placeholder="e.g. 29.99" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">External Link</label>
                  <input type="text" value={item.external_link} onChange={(e) => update({ ...item, external_link: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm" />
                  <p className="text-[0.625rem] mt-0.5" style={{ color: "var(--bark-faded)" }}>Link to purchase page (Amazon, Printful, etc.)</p>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Product Image</label>
                <ImageUploader
                  currentUrl={item.image_url}
                  onUpload={(url) => update({ ...item, image_url: url })}
                  label="Upload image"
                />
              </div>
            </div>
          )}
        />
      </div>
    </SectionEditor>
  );
}
