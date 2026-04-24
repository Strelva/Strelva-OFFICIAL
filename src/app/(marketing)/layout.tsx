import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REB — Sign in to your dashboard",
  description: "Access your business dashboard.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="marketing-root antialiased"
      style={{
        ["--m-bg" as string]: "#0e0e0e",
        ["--m-surface" as string]: "#171717",
        ["--m-raised" as string]: "#1f1f1f",
        ["--m-rule" as string]: "rgba(255,255,255,0.06)",
        ["--m-text" as string]: "#e8e8e8",
        ["--m-text-2" as string]: "#787878",
        ["--m-text-3" as string]: "#484848",
        ["--m-accent" as string]: "#5B8DEF",
        background: "#0e0e0e",
        color: "#e8e8e8",
        minHeight: "100vh",
      }}
    >
      <main>{children}</main>

      <footer className="border-t px-6" style={{ borderColor: "var(--m-rule)" }}>
        <div className="max-w-[1040px] mx-auto py-6 flex flex-col md:flex-row justify-between gap-4">
          <div className="text-[12px]" style={{ color: "var(--m-text-3)" }}>
            &copy; {new Date().getFullYear()} REB
          </div>
          <div
            className="flex gap-6 text-[12px]"
            style={{ color: "var(--m-text-3)" }}
          >
            <a href="mailto:jacob@reb.studio" className="hover:underline">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
