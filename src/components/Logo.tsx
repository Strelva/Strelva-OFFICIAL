// Strelva brand mark: a balanced cairn of stacked stones in the text color,
// with a single sage accent pebble. Stones use currentColor so the mark takes
// the surrounding text color; the pebble stays the brand accent.
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24.5" cy="7.2" r="3.4" style={{ fill: "var(--m-accent)" }} />
      <ellipse cx="20.5" cy="15.9" rx="6.6" ry="4" fill="currentColor" transform="rotate(-8 20.5 15.9)" />
      <ellipse cx="22.5" cy="26.4" rx="9.4" ry="4.9" fill="currentColor" transform="rotate(5 22.5 26.4)" />
      <ellipse cx="24" cy="38.5" rx="12.2" ry="5.6" fill="currentColor" transform="rotate(-3 24 38.5)" />
    </svg>
  );
}

// Mark + wordmark lockup, used as the brand header / home link.
export function LogoFull({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-m-text ${className}`}>
      <LogoMark className="size-7" />
      <span className="font-[family-name:var(--font-display)] text-[20px] font-medium leading-none tracking-[-0.01em]">
        Strelva
      </span>
    </span>
  );
}
