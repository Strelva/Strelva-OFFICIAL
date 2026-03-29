import type { SiteSettings, ContactContent } from "@/lib/types";

export function TrustStrip({ settings, contact }: { settings: SiteSettings; contact: ContactContent }) {
  return (
    <div
      className="py-5 md:py-6"
      style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
    >
      <div className="container-main">
        <div
          className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase"
          style={{ color: "var(--bark-faded)" }}
        >
          <span>{settings.ownerTitle || "Wellness Professional"}</span>
          <span style={{ color: "var(--cream-mid)" }}>|</span>
          <span>1-on-1 Sessions</span>
          <span style={{ color: "var(--cream-mid)" }}>|</span>
          <span>
            {contact.address
              ? contact.address.split(",").slice(-2).join(",").trim()
              : "Virtual Available"}
          </span>
        </div>
      </div>
    </div>
  );
}
