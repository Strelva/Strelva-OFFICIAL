"use client";

export function TrustStrip() {
  const items = ["NYS grown", "No preservatives", "No sulfates", "0g added sugar", "12 allergen free"];

  return (
    <div
      className="py-4 md:py-5"
      style={{ background: "var(--bark)", color: "var(--cream)" }}
    >
      <div className="container-main">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.62rem] font-bold uppercase tracking-[0.16em]">
          {items.map((item, index) => (
            <span key={item} className="inline-flex items-center gap-5">
              <span style={{ opacity: 0.78 }}>{item}</span>
              {index < items.length - 1 && (
                <span className="h-1 w-1 rounded-full" style={{ background: "var(--wheat)" }} />
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
