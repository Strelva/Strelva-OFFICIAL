"use client";

export function TrustStrip() {
  return (
    <div
      className="py-5 md:py-6"
      style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
    >
      <div className="container-main">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
          <span>2 Ingredients</span>
          <span style={{ color: "var(--cream-mid)" }}>|</span>
          <span>0g Added Sugar</span>
          <span style={{ color: "var(--cream-mid)" }}>|</span>
          <span>NYS Orchard-Grown</span>
          <span style={{ color: "var(--cream-mid)" }}>|</span>
          <span>No Preservatives</span>
        </div>
      </div>
    </div>
  );
}
