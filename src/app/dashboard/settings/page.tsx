"use client";

import { useEffect, useState } from "react";
import {
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

const SETTING_FIELDS: readonly {
  key: string;
  label: string;
  description: string;
  copyable?: boolean;
  isUrl?: boolean;
  chatPrompt: string;
}[] = [
  { key: "siteName", label: "Site Name", description: "Your business name", chatPrompt: "Change my site name to" },
  { key: "ownerName", label: "Owner Name", description: "Shown in greetings and AI interactions", chatPrompt: "Change my owner name to" },
  { key: "siteTagline", label: "Tagline", description: "Appears in search results and header", chatPrompt: "Change my tagline to" },
  { key: "siteDescription", label: "Description", description: "SEO description for Google", chatPrompt: "Update my site description" },
  { key: "bookingUrl", label: "Booking URL", description: "Where clients book sessions", copyable: true, isUrl: true, chatPrompt: "Change my booking URL to" },
  { key: "footerTagline", label: "Footer Tagline", description: "Shown at the bottom of your site", chatPrompt: "Change my footer tagline to" },
  { key: "copyrightText", label: "Copyright", description: "Legal text in footer", chatPrompt: "Change my copyright text to" },
];

type SettingsData = Record<string, string>;

export default function SettingsPage() {
  const dashboard = useDashboardOptional();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setSettings(data))
      .catch(() => setLoadError(true));
  }, []);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  if (loadError) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="bg-red-600/5 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-sm text-red-600 mb-3">Couldn&apos;t load settings</p>
          <button
            onClick={() => {
              setLoadError(false);
              setSettings(null);
              fetch("/api/content/settings")
                .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
                .then((data) => setSettings(data))
                .catch(() => setLoadError(true));
            }}
            className="px-4 py-2 rounded-md bg-white border border-[#e8e8e8] text-xs text-[#666] hover:bg-[#f5f5f5] transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6 md:p-8 max-w-3xl animate-pulse">
        <div className="mb-8">
          <div className="h-3 w-16 bg-[#f0f0f0] rounded mb-2" />
          <div className="h-7 w-40 bg-[#f0f0f0] rounded" />
        </div>
        <div className="bg-white border border-[#e8e8e8] rounded-lg">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-5 border-b border-[#f5f5f5] last:border-0">
              <div className="h-3 w-24 bg-[#f0f0f0] rounded mb-2" />
              <div className="h-4 w-48 bg-[#f5f5f5] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <span className="text-xs uppercase tracking-widest text-[#999]">
          SETTINGS
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] mt-1">
          Site configuration
        </h1>
        <p className="text-sm text-[#999] mt-1">
          Your site&apos;s identity and metadata. Hover any row to edit.
        </p>
      </div>

      {/* Settings rows */}
      <div className="bg-white border border-[#e8e8e8] rounded-lg overflow-hidden">
        {SETTING_FIELDS.map((field, i) => {
          const value = settings[field.key] || "";
          const isEmpty = !value.trim();

          return (
            <div
              key={field.key}
              className={`group relative flex items-start sm:items-center justify-between gap-4 px-5 py-4 hover:bg-[#fafafa] transition-colors duration-150 ${
                i < SETTING_FIELDS.length - 1 ? "border-b border-[#f5f5f5]" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-[#1a1a1a]">
                    {field.label}
                  </span>
                  {isEmpty && (
                    <span className="text-[10px] font-mono text-amber-600/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      empty
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#ccc] mb-1.5">{field.description}</p>
                <div className="flex items-center gap-2">
                  {field.isUrl && value ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-[#7c9a8e] hover:text-[#5a7a6e] transition-colors truncate flex items-center gap-1"
                    >
                      {value.replace(/^https?:\/\//, "")}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <p className={`font-mono text-sm truncate ${isEmpty ? "text-[#ccc] italic" : "text-[#1a1a1a]"}`}>
                      {isEmpty ? "Not set" : value}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions — visible on hover */}
              <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                {field.copyable && value && (
                  <button
                    onClick={() => handleCopy(field.key, value)}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-all duration-150"
                    title="Copy"
                  >
                    {copiedField === field.key ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => {
                    if (dashboard) {
                      dashboard.setChatPrompt(field.chatPrompt);
                    }
                  }}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-[#999] hover:text-[#7c9a8e] hover:bg-[#7c9a8e]/[0.06] transition-all duration-150"
                  title={`Edit ${field.label}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Copied toast */}
      {copiedField && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast">
          <div className="bg-white border border-[#e8e8e8] rounded-lg px-4 py-2 text-xs font-mono text-emerald-600 shadow-lg">
            Copied!
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-6 bg-white border border-[#e8e8e8] rounded-lg px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-[#1a1a1a]">Need to change something?</p>
          <p className="text-xs text-[#999] mt-0.5">Tell the AI what to update in plain English.</p>
        </div>
        <button
          onClick={() => {
            if (dashboard) {
              dashboard.setChatPrompt("Update my site settings");
            }
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-[#7c9a8e] hover:bg-[#5a7a6e] text-xs font-medium text-white transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Open Chat
        </button>
      </div>
    </div>
  );
}
