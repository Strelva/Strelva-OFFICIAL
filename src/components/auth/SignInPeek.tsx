import {
  TrendingUp,
  MousePointerClick,
  Bell,
  MessageSquareText,
} from "lucide-react";

// A small, illustrative glimpse of the dashboard the user is signing into —
// turns a bare auth page into a "here's what you'll see" brand moment.
const rows = [
  { icon: TrendingUp, label: "People found you", value: "47" },
  { icon: MousePointerClick, label: "Customer actions", value: "9" },
  { icon: Bell, label: "Needs you", value: "1" },
];

export function SignInPeek() {
  return (
    <div className="mt-10 max-w-[400px] rounded-2xl border border-m-rule bg-[var(--m-paper)]/70 p-5 shadow-[0_24px_80px_oklch(4%_0.01_255_/_0.4)] backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-m-text-3">
          This week
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--m-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-m-accent">
          <span className="size-1.5 rounded-full bg-m-accent" />
          Live
        </span>
      </div>

      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.label} className="flex items-center gap-3">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[var(--m-accent-faint)] text-m-accent">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-[13px] text-m-text-2">{r.label}</span>
              <span className="font-[family-name:var(--font-display)] text-[18px] text-m-text">
                {r.value}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-m-rule bg-[var(--m-bg)]/60 p-3">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-m-accent" />
        <p className="text-[12px] leading-[1.55] text-m-text-2">
          <span className="text-m-text">&ldquo;Add a Saturday 9am class&rdquo;</span>{" "}
          &mdash; staged, waiting for your OK.
        </p>
      </div>
    </div>
  );
}
