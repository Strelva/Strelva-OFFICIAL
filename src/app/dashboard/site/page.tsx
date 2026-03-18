import { ExternalLink } from "lucide-react";

export default function SitePage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#262626] bg-[#0a0a0a]">
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            YOUR SITE
          </span>
          <span className="font-mono text-xs text-zinc-400">
            rohlaxwellness.com
          </span>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-[#141414] border border-[#262626] text-xs text-zinc-300 hover:bg-[#1c1c1c] hover:text-white hover:border-[#333] transition-colors duration-150"
        >
          Open in new tab
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Status strip */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-[#262626] bg-[#0a0a0a]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-mono text-zinc-400">Live</span>
        </div>
        <span className="text-xs text-zinc-600">&middot;</span>
        <span className="font-mono text-[10px] text-zinc-500">
          Last updated 2h ago
        </span>
      </div>

      {/* Iframe */}
      <div className="flex-1 mx-6 my-4 rounded-lg border border-[#262626] overflow-hidden">
        <iframe
          src="/"
          className="w-full h-full border-0 bg-white"
          title="Live site preview"
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-[#262626] bg-[#0a0a0a]">
        <span className="font-mono text-[10px] tracking-widest uppercase text-zinc-600">
          POWERED BY REB
        </span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-zinc-500">
            Pages: 10
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            Visitors today: 12
          </span>
        </div>
      </div>
    </div>
  );
}
