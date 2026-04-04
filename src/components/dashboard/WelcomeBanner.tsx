"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

export function WelcomeBanner({ siteName }: { siteName: string }) {
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "true";
  const [dismissed, setDismissed] = useState(false);

  if (!isWelcome || dismissed) return null;

  return (
    <div className="bg-[var(--sage)] text-white px-5 py-4 rounded-xl mb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-[15px]">
            {siteName} is live
          </h2>
          <p className="text-white/80 text-[13px] mt-1">
            Your AI-generated site is ready. Upload photos, tweak your copy, and share your link to start getting traffic. Use the chat to make changes — just describe what you want.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/60 hover:text-white shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
