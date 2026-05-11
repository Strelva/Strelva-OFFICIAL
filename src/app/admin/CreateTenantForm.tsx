"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TEMPLATES = ["wellness", "food-brand", "restaurant", "trades", "professional"] as const;
const INDUSTRIES = ["wellness", "food-brand", "restaurant", "trades", "professional", "retail", "services"] as const;

export function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    siteName: "",
    subdomain: "",
    ownerName: "",
    ownerEmail: "",
    template: "wellness",
    industry: "wellness",
    deliveryModel: "custom_repo",
    productionDomain: "",
    adminDomain: "",
    customRepo: {
      repoName: "",
      repoUrl: "",
      localPath: "",
      capabilityManifestUrl: "",
      supportedDesignTokens: ["colors", "fonts", "buttons", "spacing", "radius", "motion", "imagery"],
      supportsPageConfig: true,
      supportsDraftPreview: true,
      supportsInlineEditing: true,
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create tenant");
      }

      setForm({
        siteName: "",
        subdomain: "",
        ownerName: "",
        ownerEmail: "",
        template: "wellness",
        industry: "wellness",
        deliveryModel: "custom_repo",
        productionDomain: "",
        adminDomain: "",
        customRepo: {
          repoName: "",
          repoUrl: "",
          localPath: "",
          capabilityManifestUrl: "",
          supportedDesignTokens: ["colors", "fonts", "buttons", "spacing", "radius", "motion", "imagery"],
          supportsPageConfig: true,
          supportsDraftPreview: true,
          supportsInlineEditing: true,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-700 transition-colors"
      >
        + New Client
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">New Client</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-white text-sm"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Site Name</label>
          <input
            type="text"
            value={form.siteName}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            placeholder="Sunrise Yoga Studio"
            required
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Internal ID</label>
          <div className="flex items-center gap-0">
            <input
              type="text"
              value={form.subdomain}
              onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder="sunrise"
              required
              className="w-full rounded-l-lg bg-zinc-800 border border-zinc-700 border-r-0 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            <span className="rounded-r-lg bg-zinc-800/50 border border-zinc-700 px-3 py-2 text-sm text-zinc-500">
              tenant
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Owner Name</label>
          <input
            type="text"
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            placeholder="First name"
            required
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Owner Email</label>
          <input
            type="email"
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            placeholder="owner@example.com"
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Template</label>
          <select
            value={form.template}
            onChange={(e) => setForm({ ...form, template: e.target.value })}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
          >
            {TEMPLATES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Industry</label>
          <select
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Delivery Model</label>
          <select
            value={form.deliveryModel}
            onChange={(e) => setForm({ ...form, deliveryModel: e.target.value })}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
          >
            <option value="custom_repo">Custom repo</option>
            <option value="platform_template">Platform template</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Website Domain</label>
          <input
            type="text"
            value={form.productionDomain}
            onChange={(e) => {
              const productionDomain = e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
              setForm({
                ...form,
                productionDomain,
                adminDomain: form.adminDomain || (productionDomain ? `admin.${productionDomain}` : ""),
              });
            }}
            placeholder="greatlakesdriedfruit.com"
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1.5">Admin Domain</label>
          <input
            type="text"
            value={form.adminDomain}
            onChange={(e) => setForm({ ...form, adminDomain: e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") })}
            placeholder={form.productionDomain ? `admin.${form.productionDomain}` : "admin.theirdomain.com"}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
        </div>

        {form.deliveryModel === "custom_repo" && (
          <>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Repo Name</label>
              <input
                type="text"
                value={form.customRepo.repoName}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, repoName: e.target.value } })}
                placeholder={form.subdomain || "client-site"}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Repo URL</label>
              <input
                type="url"
                value={form.customRepo.repoUrl}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, repoUrl: e.target.value } })}
                placeholder="https://github.com/scaffold-web/client-site"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1.5">Local Repo Path</label>
              <input
                type="text"
                value={form.customRepo.localPath}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, localPath: e.target.value } })}
                placeholder={`/Users/laneyfraass/websites/${form.subdomain || "client-site"}`}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1.5">Capability Manifest URL</label>
              <input
                type="url"
                value={form.customRepo.capabilityManifestUrl}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, capabilityManifestUrl: e.target.value } })}
                placeholder="https://client-site.com/api/reb-capabilities"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ["supportsPageConfig", "Page config"],
                ["supportsDraftPreview", "Draft preview"],
                ["supportsInlineEditing", "Inline editing"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={Boolean(form.customRepo[key as keyof typeof form.customRepo])}
                    onChange={(e) => setForm({
                      ...form,
                      customRepo: { ...form.customRepo, [key]: e.target.checked },
                    })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}

        <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-white text-zinc-900 px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Client"}
          </button>
        </div>
      </form>
    </div>
  );
}
