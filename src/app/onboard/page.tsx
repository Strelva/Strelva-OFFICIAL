"use client";

import { useState } from "react";

type Step = "info" | "generating" | "preview" | "checkout";

interface BusinessInfo {
  businessName: string;
  industry: string;
  location: string;
  description: string;
  phone: string;
  email: string;
  bookingUrl: string;
}

interface GeneratedResult {
  content: Record<string, unknown>;
  template: string;
  subdomain: string;
}

const INDUSTRIES = [
  "Wellness & Spa",
  "Fitness & Yoga",
  "Restaurant & Cafe",
  "Trades & Home Services",
  "Professional Services",
  "Health & Medical",
  "Beauty & Salon",
  "Other",
];

export default function OnboardPage() {
  const [step, setStep] = useState<Step>("info");
  const [info, setInfo] = useState<BusinessInfo>({
    businessName: "",
    industry: "",
    location: "",
    description: "",
    phone: "",
    email: "",
    bookingUrl: "",
  });
  const [generated, setGenerated] = useState<GeneratedResult | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateInfo(field: keyof BusinessInfo, value: string) {
    setInfo((prev) => ({ ...prev, [field]: value }));
    if (field === "businessName") {
      setSubdomain(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }

  async function handleGenerate() {
    setError("");
    setStep("generating");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(typeof data.error === "string" ? data.error : "Generation failed");
      }

      const data = await res.json();
      setGenerated(data);
      setSubdomain(data.subdomain);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("info");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!generated) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/onboard/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: info.businessName,
          ownerName: info.businessName, // they can update later
          ownerEmail: info.email,
          industry: info.industry,
          subdomain,
          template: generated.template,
          content: generated.content,
          bookingUrl: info.bookingUrl || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(typeof data.error === "string" ? data.error : "Setup failed");
      }

      const data = await res.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.dashboardUrl) {
        window.location.href = data.dashboardUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {["info", "generating", "preview", "checkout"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  step === s
                    ? "bg-[var(--sage)]"
                    : ["info", "generating", "preview", "checkout"].indexOf(step) > i
                      ? "bg-[var(--sage-light)]"
                      : "bg-[var(--cream-mid)]"
                }`}
              />
              {i < 3 && <div className="w-8 h-px bg-[var(--cream-mid)]" />}
            </div>
          ))}
        </div>

        {/* Step: Business Info */}
        {step === "info" && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[var(--gray-border)]">
            <h1 className="text-2xl font-semibold text-[var(--bark)] mb-2">
              Tell us about your business
            </h1>
            <p className="text-[var(--bark-faded)] mb-8">
              We'll build your website in under a minute.
            </p>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-6">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Business name *
                </label>
                <input
                  type="text"
                  value={info.businessName}
                  onChange={(e) => updateInfo("businessName", e.target.value)}
                  placeholder="Sunrise Yoga Studio"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Industry *
                </label>
                <select
                  value={info.industry}
                  onChange={(e) => updateInfo("industry", e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                >
                  <option value="">Select your industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  value={info.location}
                  onChange={(e) => updateInfo("location", e.target.value)}
                  placeholder="Buffalo, NY"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Describe your business *
                </label>
                <textarea
                  value={info.description}
                  onChange={(e) => updateInfo("description", e.target.value)}
                  placeholder="We offer private and group yoga classes with a focus on beginners. Open since 2019, located downtown..."
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={info.email}
                    onChange={(e) => updateInfo("email", e.target.value)}
                    placeholder="hello@yourbiz.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={info.phone}
                    onChange={(e) => updateInfo("phone", e.target.value)}
                    placeholder="(716) 555-0123"
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Booking URL
                  <span className="text-[var(--gray-muted)] font-normal"> (optional)</span>
                </label>
                <input
                  type="url"
                  value={info.bookingUrl}
                  onChange={(e) => updateInfo("bookingUrl", e.target.value)}
                  placeholder="https://www.vagaro.com/yourbiz"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--gray-border)] bg-white text-[var(--bark)] placeholder:text-[var(--gray-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)]"
                />
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!info.businessName || !info.industry || !info.description}
              className="w-full mt-8 py-3 rounded-lg bg-[var(--sage)] text-white font-medium hover:bg-[var(--sage-dark)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Build my site
            </button>
          </div>
        )}

        {/* Step: Generating */}
        {step === "generating" && (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-[var(--gray-border)] text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--sage-wash)] mb-6">
              <svg className="w-8 h-8 text-[var(--sage)] animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="60" strokeDashoffset="20" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-[var(--bark)] mb-2">
              Building your website...
            </h2>
            <p className="text-[var(--bark-faded)]">
              Our AI is writing your content, picking your layout, and setting everything up. Takes about 15 seconds.
            </p>
          </div>
        )}

        {/* Step: Preview */}
        {step === "preview" && generated && (
          <div className="bg-white rounded-2xl shadow-sm border border-[var(--gray-border)] overflow-hidden">
            <div className="p-8">
              <h2 className="text-xl font-semibold text-[var(--bark)] mb-1">
                Here's your site
              </h2>
              <p className="text-[var(--bark-faded)] mb-6">
                You can change everything later from your dashboard.
              </p>

              {error && (
                <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 mb-6">
                  {error}
                </div>
              )}

              {/* Content preview cards */}
              <div className="space-y-4">
                <PreviewCard
                  title="Homepage"
                  content={generated.content.hero as Record<string, unknown>}
                  fields={["headline", "subheadline", "tagline"]}
                />
                <PreviewCard
                  title="About"
                  content={generated.content.story as Record<string, unknown>}
                  fields={["headline", "statement"]}
                />
                <PreviewCard
                  title="Services"
                  content={generated.content.services as Record<string, unknown>}
                  fields={["headline", "description"]}
                  listField="services"
                  listLabel="name"
                />
                <PreviewCard
                  title="FAQ"
                  content={generated.content.faq as Record<string, unknown>}
                  fields={["headline"]}
                  listField="faqs"
                  listLabel="question"
                />
              </div>

              {/* Subdomain */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-[var(--bark)] mb-1.5">
                  Your site URL
                </label>
                <div className="flex items-center gap-0">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(e) =>
                      setSubdomain(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "")
                      )
                    }
                    className="px-4 py-2.5 rounded-l-lg border border-r-0 border-[var(--gray-border)] bg-white text-[var(--bark)] focus:outline-none focus:ring-2 focus:ring-[var(--sage)]/30 focus:border-[var(--sage)] w-48"
                  />
                  <span className="px-4 py-2.5 rounded-r-lg border border-[var(--gray-border)] bg-[var(--gray-bg)] text-[var(--bark-faded)] text-sm">
                    .reb.studio
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-[var(--gray-border)] p-6 bg-[var(--gray-bg-alt)] flex items-center justify-between">
              <button
                onClick={() => setStep("info")}
                className="px-5 py-2.5 rounded-lg text-[var(--bark-faded)] hover:text-[var(--bark)] transition-colors"
              >
                Go back
              </button>
              <button
                onClick={handleComplete}
                disabled={loading || !subdomain}
                className="px-8 py-2.5 rounded-lg bg-[var(--sage)] text-white font-medium hover:bg-[var(--sage-dark)] disabled:opacity-40 transition-colors"
              >
                {loading ? "Setting up..." : "Launch my site"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewCard({
  title,
  content,
  fields,
  listField,
  listLabel,
}: {
  title: string;
  content: Record<string, unknown>;
  fields: string[];
  listField?: string;
  listLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--gray-border)] p-5">
      <h3 className="text-sm font-medium text-[var(--sage)] uppercase tracking-wider mb-3">
        {title}
      </h3>
      {fields.map((field) => {
        const val = content[field];
        if (!val || typeof val !== "string") return null;
        return (
          <p key={field} className={field === fields[0] ? "text-lg font-semibold text-[var(--bark)] mb-1" : "text-[var(--bark-faded)] text-sm mb-1"}>
            {val}
          </p>
        );
      })}
      {listField && listLabel && Array.isArray(content[listField]) && (
        <div className="flex flex-wrap gap-2 mt-2">
          {(content[listField] as Record<string, unknown>[]).slice(0, 5).map((item, i) => (
            <span
              key={i}
              className="text-xs px-2.5 py-1 rounded-full bg-[var(--sage-wash)] text-[var(--sage-dark)]"
            >
              {item[listLabel] as string}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
