"use client";

export function CommandTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("strelva:cmdk"))}
      className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-glass-border px-2 py-1 text-[11px] text-gray-faint transition-colors hover:text-warm-white"
      aria-label="Open command palette"
    >
      <span className="font-medium">⌘K</span>
    </button>
  );
}
