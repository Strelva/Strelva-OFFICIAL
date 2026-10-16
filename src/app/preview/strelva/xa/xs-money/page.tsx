import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XS_MONEY_SCREENS } from "@/experience/workspace/preview/xs-money-screens";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Strelva · XA money screens",
  robots: { index: false, follow: false },
};

/** An index of the money previews and their states, for review. */
export default function XsMoneyIndex() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return (
    <main
      data-workspace-theme="linen"
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        background: "var(--st-canvas)",
        color: "var(--st-text)",
      }}
    >
      <h1 style={{ margin: "0 0 24px", fontSize: 28, fontWeight: 600 }}>
        Money, in XA
      </h1>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 15,
        }}
      >
        {Object.entries(XS_MONEY_SCREENS).map(([screen, states]) => (
          <li key={screen}>
            <strong style={{ fontWeight: 500 }}>{screen}</strong>{" "}
            {states.map((state, index) => (
              <span key={state}>
                {index ? " · " : ""}
                <Link
                  href={`/preview/strelva/xa/xs-money/${screen}?state=${state}`}
                >
                  {state}
                </Link>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
