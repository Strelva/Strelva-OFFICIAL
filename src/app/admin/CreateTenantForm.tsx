"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Canonical verticals = the templates the engine actually ships
// (src/components/templates/registry.ts). Kept in sync with /admin/onboard's
// INDUSTRIES so both new-client entry points offer the same set. retail/services
// were dropped — no template or page-config default exists for them.
const TEMPLATES = ["wellness", "food-brand", "restaurant", "trades", "professional", "fashion-stylist"] as const;
// Industry is the business VERTICAL (free-form downstream) and need not have a matching
// template — these extra verticals are custom-repo verticals with no template/page-config
// default (kept in sync with scripts/provision-tenant.ts VALID_INDUSTRIES).
const INDUSTRIES = [
  ...TEMPLATES,
  "medical", "ecommerce", "retail", "home-services", "automotive", "beauty",
  "fitness", "legal", "real-estate", "financial", "education", "hospitality",
  "pet-services", "nonprofit",
] as const;

const inputCls =
  "w-full rounded-md bg-gray-bg border border-glass-border px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 transition-colors";
const labelCls = "block text-xs text-gray-muted mb-1.5";

export function CreateTenantForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blankForm = {
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
  };

  const [form, setForm] = useState(blankForm);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
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

      setForm(blankForm);
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
        className="rounded-lg bg-gray-bg border border-glass-border px-4 py-2 text-sm text-warm-white hover:bg-gray-bg-hover transition-colors"
      >
        + New Client
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-glass-border bg-glass p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-warm-white">New Client</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-muted hover:text-warm-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-critical0/10 border border-critical0/20 text-critical text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Site Name</label>
          <input
            type="text"
            value={form.siteName}
            onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            placeholder="Sunrise Yoga Studio"
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Internal ID</label>
          <div className="flex items-center gap-0">
            <input
              type="text"
              value={form.subdomain}
              onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder="sunrise"
              required
              className="w-full rounded-l-md bg-gray-bg border border-glass-border border-r-0 px-3 py-2 text-sm text-warm-white placeholder:text-gray-faint focus:outline-none focus:border-accent/50 transition-colors"
            />
            <span className="rounded-r-md bg-gray-bg/50 border border-glass-border px-3 py-2 text-sm text-gray-muted">
              tenant
            </span>
          </div>
        </div>

        <div>
          <label className={labelCls}>Owner Name</label>
          <input
            type="text"
            value={form.ownerName}
            onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
            placeholder="First name"
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Owner Email</label>
          <input
            type="email"
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            placeholder="owner@example.com"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Template</label>
          <select
            aria-label="Template"
            value={form.template}
            onChange={(e) => setForm({ ...form, template: e.target.value })}
            className={inputCls}
          >
            {TEMPLATES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Industry</label>
          <select
            aria-label="Industry"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            className={inputCls}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Delivery Model</label>
          <select
            aria-label="Delivery Model"
            value={form.deliveryModel}
            onChange={(e) => setForm({ ...form, deliveryModel: e.target.value })}
            className={inputCls}
          >
            <option value="custom_repo">Custom repo</option>
            <option value="platform_template">Platform template</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Website Domain</label>
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
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Admin Domain</label>
          <input
            type="text"
            value={form.adminDomain}
            onChange={(e) => setForm({ ...form, adminDomain: e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") })}
            placeholder={form.productionDomain ? `admin.${form.productionDomain}` : "admin.theirdomain.com"}
            className={inputCls}
          />
        </div>

        {form.deliveryModel === "custom_repo" && (
          <>
            <div>
              <label className={labelCls}>Repo Name</label>
              <input
                type="text"
                value={form.customRepo.repoName}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, repoName: e.target.value } })}
                placeholder={form.subdomain || "client-site"}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Repo URL</label>
              <input
                type="url"
                value={form.customRepo.repoUrl}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, repoUrl: e.target.value } })}
                placeholder="https://github.com/scaffold-web/client-site"
                className={inputCls}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Local Repo Path</label>
              <input
                type="text"
                value={form.customRepo.localPath}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, localPath: e.target.value } })}
                placeholder={`/Users/laneyfraass/websites/${form.subdomain || "client-site"}`}
                className={inputCls}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Capability Manifest URL</label>
              <input
                type="url"
                value={form.customRepo.capabilityManifestUrl}
                onChange={(e) => setForm({ ...form, customRepo: { ...form.customRepo, capabilityManifestUrl: e.target.value } })}
                placeholder="https://client-site.com/api/reb-capabilities"
                className={inputCls}
              />
            </div>

            <fieldset className="sm:col-span-2">
              <legend className={labelCls}>Supported Features</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ["supportsPageConfig", "Page config"],
                  ["supportsDraftPreview", "Draft preview"],
                  ["supportsInlineEditing", "Inline editing"],
                ] as [string, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-md border border-glass-border bg-gray-bg px-3 py-2 text-xs text-gray-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(form.customRepo[key as keyof typeof form.customRepo])}
                      onChange={(e) => setForm({
                        ...form,
                        customRepo: { ...form.customRepo, [key]: e.target.checked },
                      })}
                      className="accent-[var(--color-accent)]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-4 py-2 text-sm text-gray-muted hover:text-warm-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent text-on-accent px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Client"}
          </button>
        </div>
      </form>
    </div>
  );
}
