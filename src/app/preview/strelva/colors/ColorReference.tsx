"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { TONE_PILL } from "@/lib/status-colors";

export function ColorReference() {
  const [checked, setChecked] = useState(true);
  return <main className="bg-surface-base p-6 text-warm-black">
    <h1 className="font-display text-3xl">Color reference</h1>
    <p className="mt-2 text-sm text-gray-muted">Local component examples. These controls do not change saved work.</p>
    {(["light", "dark"] as const).map(theme => <section key={theme} data-testid={`colors-${theme}`} data-dashboard={theme === "dark" ? "" : undefined} className="mt-6 rounded-3xl border border-gray-border bg-surface-base p-6 text-warm-black">
      <h2 className="text-2xl">{theme === "dark" ? "Dashboard" : "Default light foundation"}</h2>
      <div className="mt-6 flex flex-wrap gap-4">
        <Button>Primary action</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="contrast">Contrast</Button><Button variant="danger">Remove example</Button><Button disabled>Unavailable</Button>
        <Toggle label={`${theme} example setting`} checked={checked} onChange={setChecked} />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["surface-base", "surface", "surface-raised", "surface-inset"] as const).map(surface => <div key={surface} className="rounded-xl border border-gray-border p-4" style={{ background: `var(--${surface})` }}>
          <strong>{surface}</strong><p className="mt-2 text-sm text-gray-muted">Secondary text</p><p className="mt-2 text-xs text-gray-subtle">Supporting detail</p><p className="mt-2 text-xs text-gray-faint">Field hint</p>
        </div>)}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">{Object.entries(TONE_PILL).map(([tone, className]) => <span key={tone} className={`rounded-lg border px-3 py-2 text-sm ${className}`}>{tone}</span>)}</div>
      <label className="mt-6 block text-sm">Example field<input placeholder="A field hint" className="mt-2 block w-full max-w-sm rounded-xl border border-gray-border bg-surface px-4 py-3 text-warm-black placeholder:text-gray-faint" /></label>
      <div className="mt-6 rounded-xl border border-gray-border bg-surface-popover p-4 text-text-popover">Popover description</div>
      <div className="mt-4 inline-block rounded-xl bg-surface-tooltip px-4 py-3 text-text-tooltip">Tooltip text</div>
    </section>)}
  </main>;
}
