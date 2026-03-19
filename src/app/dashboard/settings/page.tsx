"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Pencil,
} from "lucide-react";

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
        <div className="bg-red-600/5 border border-red-600/20 rounded-lg p-6 text-center">
          <p className="text-sm text-red-400 mb-3">Couldn&apos;t load settings</p>
          <button
            onClick={() => { setLoadError(false); setSettings(null); window.location.reload(); }}
            className="px-4 py-2 rounded-md bg-[#141414] border border-[#262626] text-xs text-zinc-300 hover:bg-[#1c1c1c] transition-colors"
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
          <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
          <div className="h-7 w-40 bg-zinc-800 rounded" />
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-lg">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-5 border-b border-[#1c1c1c] last:border-0">
              <div className="h-3 w-24 bg-zinc-800 rounded mb-2" />
              <div className="h-4 w-48 bg-zinc-800/60 rounded" />
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
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          SETTINGS
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-white mt-1">
          Site configuration
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Your site&apos;s identity and metadata. Hover any row to edit.
        </p>
      </div>

      {/* Settings rows */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg overflow-hidden">
        {SETTING_FIELDS.map((field, i) => {
          const value = settings[field.key] || "";
          const isEmpty = !value.trim();

          return (
            <div
              key={field.key}
              className={`group relative flex items-start sm:items-center justify-between gap-4 px-5 py-4 hover:bg-[#1a1a1a] transition-colors duration-150 ${
                i < SETTING_FIELDS.length - 1 ? "border-b border-[#1c1c1c]" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-zinc-300">
                    {field.label}
                  </span>
                  {isEmpty && (
                    <span className="text-[10px] font-mono text-amber-500/70 bg-amber-500/10 px-1.5 py-0.5 rounded">
                      empty
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mb-1.5">{field.description}</p>
                <div className="flex items-center gap-2">
                  {field.isUrl && value ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-violet-400 hover:text-violet-300 transition-colors truncate flex items-center gap-1"
                    >
                      {value.replace(/^https?:\/\//, "")}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <p className={`font-mono text-sm truncate ${isEmpty ? "text-zinc-600 italic" : "text-zinc-200"}`}>
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
                    className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-[#262626] transition-all duration-150"
                    title="Copy"
                  >
                    {copiedField === field.key ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
                <Link
                  href="/dashboard/chat"
                  className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-violet-400 hover:bg-violet-600/10 transition-all duration-150"
                  title={`Edit ${field.label}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Copied toast */}
      {copiedField && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-toast">
          <div className="bg-[#141414] border border-[#262626] rounded-lg px-4 py-2 text-xs font-mono text-emerald-400 shadow-lg">
            Copied!
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="mt-6 bg-[#141414] border border-[#262626] rounded-lg px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-300">Need to change something?</p>
          <p className="text-xs text-zinc-500 mt-0.5">Tell the AI what to update in plain English.</p>
        </div>
        <Link
          href="/dashboard/chat"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-violet-600 hover:bg-violet-500 text-xs font-medium text-white transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Open Chat
        </Link>
      </div>
    </div>
  );
}
