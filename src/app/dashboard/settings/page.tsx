"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Copy, Check } from "lucide-react";

const SETTING_FIELDS: readonly { key: string; label: string; copyable?: boolean }[] = [
  { key: "siteName", label: "SITE NAME" },
  { key: "siteTagline", label: "TAGLINE" },
  { key: "siteDescription", label: "DESCRIPTION" },
  { key: "vagaroUrl", label: "BOOKING URL", copyable: true },
  { key: "footerTagline", label: "FOOTER TAGLINE" },
  { key: "copyrightText", label: "COPYRIGHT" },
];

type SettingsData = Record<string, string>;

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/content/settings")
      .then((res) => res.json())
      .then((data) => setSettings(data))
      .catch(() => setSettings(null));
  }, []);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  if (!settings) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <div className="mb-6">
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            SETTINGS
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-white mt-1">
            Site configuration
          </h1>
        </div>
        <div className="bg-[#141414] border border-[#262626] rounded-lg p-8 text-center text-sm text-zinc-500">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          SETTINGS
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-white mt-1">
          Site configuration
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Current values for your site. Use the AI Chat to make changes.
        </p>
      </div>

      {/* Settings list */}
      <div className="bg-[#141414] border border-[#262626] rounded-lg">
        {SETTING_FIELDS.map((field, i) => (
          <div
            key={field.key}
            className={`px-5 py-4 hover:bg-[#1c1c1c]/50 transition-colors duration-150 ${
              i < SETTING_FIELDS.length - 1
                ? "border-b border-[#1c1c1c]"
                : ""
            }`}
          >
            <span className="text-xs uppercase tracking-wider text-zinc-500 block mb-1">
              {field.label}
            </span>
            <div className="flex items-center gap-2">
              <p className="font-mono text-sm text-zinc-200 break-words flex-1">
                {settings[field.key]}
              </p>
              {field.copyable && settings[field.key] && (
                <button
                  onClick={() => handleCopy(field.key, settings[field.key])}
                  className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-[#262626] transition-colors duration-150"
                  title="Copy to clipboard"
                >
                  {copiedField === field.key ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
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
        <p className="text-sm text-zinc-400">
          To change settings, use the AI Chat
        </p>
        <Link
          href="/dashboard/chat"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-xs text-white transition-colors duration-150"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Open Chat
        </Link>
      </div>
    </div>
  );
}
