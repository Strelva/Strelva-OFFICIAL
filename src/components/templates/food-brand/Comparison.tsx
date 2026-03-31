"use client";

const comparisonData = [
  {
    label: "Ingredients",
    us: "Apples, Cinnamon",
    them: "Apples, Sugar, Citric Acid, Sodium Sulfite, Calcium Stearate",
  },
  {
    label: "Preservatives",
    us: "None",
    them: "Sodium Sulfite, Calcium Stearate",
  },
  {
    label: "Added Sugar",
    us: "0g",
    them: "Up to 12g per serving",
  },
  {
    label: "Processing",
    us: "Hand-sliced & dehydrated",
    them: "Machine-processed, chemically treated",
  },
  {
    label: "Source",
    us: "NYS-grown orchards",
    them: "Imported, origin varies",
  },
];

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
    <path d="M5 8l2.5 2.5L11 6" stroke="var(--sage)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CrossIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function Comparison() {
  return (
    <section id="comparison" className="relative py-10 md:py-14" style={{ background: "var(--warm-black)" }}>
      <div className="container-main">
        {/* Header with inline stats */}
        <div className="mb-8 md:mb-10">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-end">
            <div>
              <h2
                className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05] mb-5"
                style={{ color: "var(--cream)" }}
              >
                What&apos;s really in
                <br />
                your snack?
              </h2>
              <p
                className="text-base md:text-lg leading-relaxed max-w-lg"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Most &ldquo;healthy&rdquo; dried fruit is loaded with preservatives
                and added sugar. Ours isn&apos;t.
              </p>
            </div>
            <div className="flex gap-12 md:justify-end">
              {[
                { value: "2", label: "Ingredients" },
                { value: "0g", label: "Added Sugar" },
                { value: "100%", label: "NYS Grown" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p
                    className="font-display text-3xl md:text-4xl tracking-tight"
                    style={{ color: "var(--wheat)" }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className="text-[0.5625rem] tracking-widest uppercase mt-1"
                    style={{ color: "rgba(255,255,255,0.5)" }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <div className="max-w-3xl">
          {/* Column headers — desktop */}
          <div className="hidden sm:grid grid-cols-3 gap-4 mb-6 px-4">
            <div />
            <div>
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "var(--sage-light)" }}
              >
                Great Lakes
              </span>
            </div>
            <div>
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "rgba(255,255,255,0.5)" }}
              >
                Typical Brand
              </span>
            </div>
          </div>

          {/* Desktop rows */}
          <div className="hidden sm:block">
            {comparisonData.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 gap-4 py-5 px-4"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div>
                  <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {row.label}
                  </span>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--sage-light)" }}>
                    <CheckIcon />
                    {row.us}
                  </span>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                    <CrossIcon />
                    {row.them}
                  </span>
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-4">
            {comparisonData.map((row) => (
              <div
                key={row.label}
                className="p-4"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p
                  className="text-xs font-bold tracking-widest uppercase mb-3"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {row.label}
                </p>
                <div className="flex items-start gap-2 mb-2">
                  <CheckIcon />
                  <span className="text-sm font-medium" style={{ color: "var(--sage-light)" }}>
                    {row.us}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CrossIcon />
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                    {row.them}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-10">
          <a
            href="#products"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 text-sm font-bold tracking-widest uppercase transition-all duration-300"
            style={{ background: "var(--cream)", color: "var(--bark)" }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.background = "var(--wheat-light)";
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.background = "var(--cream)";
            }}
          >
            Try Apple Snaps
          </a>
        </div>
      </div>
    </section>
  );
}
