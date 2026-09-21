"use client";

import type { TrackerHandoffPreview as TrackerPreview } from "@/products/tracker/contracts";

/** Read-only, bounded presentation for an addressed Tracker handoff. */
export function TrackerHandoffPreview({ preview }: { preview: TrackerPreview }) {
  return (
    <section aria-labelledby="tracker-handoff-title" className="space-y-5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-text">Spreadsheet tracker</p>
        <h2 id="tracker-handoff-title" className="mt-2 font-display text-[28px] font-medium text-warm-black">{preview.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-muted">
          Read-only preview · revision {preview.revision} · {preview.rowCount} {preview.rowCount === 1 ? "row" : "rows"} · {preview.historyCount} recorded {preview.historyCount === 1 ? "edit" : "edits"}
        </p>
        <p className="mt-1 text-[12px] text-gray-muted">Source: {preview.source.fileName}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-border" tabIndex={0} role="region" aria-labelledby="tracker-handoff-title">
        <table className="w-full min-w-max text-left text-[13px]">
          <caption className="border-b border-gray-border p-3 text-left text-[12px] text-gray-muted">Current tracker rows from the addressed handoff preview.</caption>
          <thead className="bg-gray-bg text-[11px] uppercase tracking-[0.08em] text-gray-muted">
            <tr>
              <th scope="col" className="p-3">Source row</th>
              {preview.columns.map((column) => <th scope="col" className="p-3" key={column.id}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.id} className={row.state === "deleted" ? "text-gray-muted line-through" : ""}>
                <th scope="row" className="p-3 font-normal">{row.sourceRow ?? "Added"}</th>
                {preview.columns.map((column) => <td className="p-3" key={column.id}>{row.cells[column.id] || ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] leading-relaxed text-gray-muted">Accepting creates a customer-owned copy. The source agency keeps no access unless you choose read-only access below.</p>
    </section>
  );
}
