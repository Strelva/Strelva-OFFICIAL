import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getContent } from "@/lib/storage";

const SETTING_FIELDS = [
  { key: "siteName", label: "SITE NAME" },
  { key: "siteTagline", label: "TAGLINE" },
  { key: "siteDescription", label: "DESCRIPTION" },
  { key: "vagaroUrl", label: "BOOKING URL" },
  { key: "footerTagline", label: "FOOTER TAGLINE" },
  { key: "copyrightText", label: "COPYRIGHT" },
] as const;

export default async function SettingsPage() {
  const settings = await getContent("settings");

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
            className={`px-5 py-4 ${
              i < SETTING_FIELDS.length - 1
                ? "border-b border-[#1c1c1c]"
                : ""
            }`}
          >
            <span className="text-xs uppercase tracking-wider text-zinc-500 block mb-1">
              {field.label}
            </span>
            <p className="font-mono text-sm text-zinc-200 break-words">
              {settings[field.key]}
            </p>
          </div>
        ))}
      </div>

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
