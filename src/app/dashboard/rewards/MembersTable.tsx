"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { RewardsMember } from "@/lib/rewardsProxy";

// Matches GLDF's DEFAULT_REWARDS_CONFIG.tierThresholdSuper. Kept local so
// this page doesn't pull the full config over the wire on every load.
const TIER_THRESHOLD_SUPER = 500;

type SortKey = "email" | "starsAvailable" | "tier" | "createdAt";
type SortDir = "asc" | "desc";

interface Props {
  members: RewardsMember[];
}

function computedTier(m: RewardsMember): "snapper" | "super-snapper" {
  if (m.tierOverride) return m.tierOverride;
  return m.starsLifetime >= TIER_THRESHOLD_SUPER ? "super-snapper" : "snapper";
}

function tierLabel(t: "snapper" | "super-snapper"): string {
  return t === "super-snapper" ? "Super Snapper" : "Snapper";
}

export function MembersTable({ members }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("starsAvailable");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? members.filter((m) => m.email.toLowerCase().includes(q))
      : members;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "email":
          cmp = a.email.localeCompare(b.email);
          break;
        case "starsAvailable":
          cmp = a.starsAvailable - b.starsAvailable;
          break;
        case "tier":
          cmp = computedTier(a).localeCompare(computedTier(b));
          break;
        case "createdAt":
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [members, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "email" ? "asc" : "desc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-subtle" />
          <input
            type="text"
            placeholder="Search by email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-md bg-white border border-gray-border text-xs text-warm-black placeholder:text-gray-subtle focus:outline-none focus:border-sage"
          />
        </div>
        <span className="text-xs text-gray-muted">
          {rows.length} of {members.length}
        </span>
      </div>

      <div className="bg-white border border-gray-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-bg-alt border-b border-gray-border">
            <tr>
              <Th onClick={() => toggleSort("email")}>
                Email{sortIndicator("email")}
              </Th>
              <Th onClick={() => toggleSort("starsAvailable")}>
                Stars{sortIndicator("starsAvailable")}
              </Th>
              <Th onClick={() => toggleSort("tier")}>
                Tier{sortIndicator("tier")}
              </Th>
              <Th onClick={() => toggleSort("createdAt")}>
                Joined{sortIndicator("createdAt")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const tier = computedTier(m);
              return (
                <tr
                  key={m.email}
                  className={i < rows.length - 1 ? "border-b border-gray-bg" : ""}
                >
                  <td className="px-4 py-3 font-mono text-warm-black">{m.email}</td>
                  <td className="px-4 py-3 text-warm-black">
                    {m.starsAvailable}
                    <span className="text-gray-subtle">
                      {" "}
                      / {m.starsLifetime} lifetime
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-muted">{tierLabel(tier)}</td>
                  <td className="px-4 py-3 text-gray-muted">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-left text-xs font-medium text-gray-muted uppercase tracking-wider cursor-pointer select-none hover:text-warm-black"
    >
      {children}
    </th>
  );
}
