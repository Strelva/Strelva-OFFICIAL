"use client";

type Source = "google" | "yelp" | "calendly" | "instagram" | "vegaro" | "website" | "ai";

const SOURCE_STYLES: Record<Source, { bg: string; text: string }> = {
  google: { bg: "bg-blue-500/15", text: "text-blue-400" },
  yelp: { bg: "bg-red-500/15", text: "text-red-400" },
  calendly: { bg: "bg-green-500/15", text: "text-green-400" },
  instagram: { bg: "bg-pink-500/15", text: "text-pink-400" },
  vegaro: { bg: "bg-green-500/15", text: "text-green-400" },
  website: { bg: "bg-gray-bg", text: "text-gray-fg" },
  ai: { bg: "bg-purple-500/15", text: "text-purple-400" },
};

interface SourceBadgeProps {
  source: Source;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const styles = SOURCE_STYLES[source] || SOURCE_STYLES.website;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${styles.bg} ${styles.text}`}
    >
      {source}
    </span>
  );
}
