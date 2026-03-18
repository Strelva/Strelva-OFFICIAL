import { ExternalLink } from "lucide-react";

export default function SitePage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
        <div>
          <h1 className="text-sm font-semibold text-white">Your live site</h1>
          <p className="text-xs text-zinc-500">
            This is what visitors see right now.
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          Open in new tab
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* iframe */}
      <div className="flex-1 bg-white">
        <iframe
          src="/"
          className="w-full h-full border-0"
          title="Live site preview"
        />
      </div>
    </div>
  );
}
