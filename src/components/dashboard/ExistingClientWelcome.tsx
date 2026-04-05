"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "reb-welcome-dismissed";

interface ActivityItem {
  text: string;
  time: string;
}

interface ExistingClientWelcomeProps {
  ownerName: string;
  siteUrl: string;
  activity: ActivityItem[];
  onOpenChat: () => void;
}

export function ExistingClientWelcome({ ownerName, siteUrl, activity, onOpenChat }: ExistingClientWelcomeProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  if (dismissed) return null;

  const displayUrl = siteUrl.replace(/^https?:\/\//, "");

  return (
    <div className="bg-sage-dark text-white px-5 py-4 rounded-xl mb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-[15px]">
            Hey {ownerName} — I&apos;ve been managing {displayUrl}
          </h2>

          {activity.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <span className="text-[11px] font-medium tracking-wider text-white/60 uppercase">Recent activity</span>
              {activity.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-white/80">
                  <div className="w-1 h-1 rounded-full bg-white/40 shrink-0" />
                  <span className="flex-1 truncate">{item.text}</span>
                  <span className="text-white/40 text-[11px] shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onOpenChat}
            className="mt-3 text-[13px] font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition-colors"
          >
            Try asking me something
          </button>
        </div>

        <button
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "true");
            setDismissed(true);
          }}
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
