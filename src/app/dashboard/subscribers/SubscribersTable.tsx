"use client";

import { Download } from "lucide-react";
import type { NewsletterSubscriber } from "@/lib/storage";

interface SubscribersTableProps {
  subscribers: NewsletterSubscriber[];
}

function toCsv(rows: NewsletterSubscriber[]): string {
  const header = "email,name,subscribedAt,status";
  const body = rows
    .map((r) =>
      [r.email, r.name || "", r.subscribedAt, r.status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function SubscribersTable({ subscribers }: SubscribersTableProps) {
  const handleExport = () => {
    const csv = toCsv(subscribers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (subscribers.length === 0) {
    return (
      <div className="bg-surface border border-gray-border rounded-lg p-12 text-center">
        <p className="text-sm text-gray-muted">
          Subscribers will appear here once people sign up on your site.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface border border-gray-border text-xs font-medium text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <div className="bg-surface border border-gray-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-bg-alt border-b border-gray-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-muted uppercase tracking-wider">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-muted uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-muted uppercase tracking-wider">
                Subscribed
              </th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((s, i) => (
              <tr
                key={s.email}
                className={i < subscribers.length - 1 ? "border-b border-gray-bg" : ""}
              >
                <td className="px-4 py-3 font-mono text-warm-black">{s.email}</td>
                <td className="px-4 py-3 text-gray-muted">{s.name || "—"}</td>
                <td className="px-4 py-3 text-gray-muted">
                  {new Date(s.subscribedAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
