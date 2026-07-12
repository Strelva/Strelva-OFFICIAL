"use client";

import { useRouter, usePathname } from "next/navigation";
import { segmentPill as pill } from "./segment-pill";

/** Switch the Reports surface between the weekly recap and the monthly recap.
 *  Updates `?view=` so the server renders the chosen recap. Only shown when a
 *  monthly recap exists (otherwise there's nothing to toggle to). */
export function ReportsViewToggle({ current }: { current: "weekly" | "monthly" }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (view: string) => router.push(`${pathname}?view=${view}`);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => go("weekly")} className={pill(current === "weekly")}>
        Weekly
      </button>
      <button type="button" onClick={() => go("monthly")} className={pill(current === "monthly")}>
        Monthly
      </button>
    </div>
  );
}
