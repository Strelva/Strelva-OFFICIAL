import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TENANT_OG: Record<
  string,
  { name: string; tagline: string; initials: string; bg: string; accent: string; fg: string }
> = {
  rohlax: {
    name: "Rohlax Wellness",
    tagline: "Wellness Services in Buffalo, NY",
    initials: "RW",
    bg: "#3d3229",
    accent: "#7c9a8e",
    fg: "#faf9f7",
  },
  gldf: {
    name: "Great Lakes Dried Fruit",
    tagline: "Orchard-Dried Apple Snacks",
    initials: "GL",
    bg: "#2c2418",
    accent: "#5a260c",
    fg: "#faf8f5",
  },
};

const DEFAULT_OG = {
  name: "Scaffold Web",
  tagline: "Your site works while you sleep",
  initials: "R",
  bg: "#3d3229",
  accent: "#7c9a8e",
  fg: "#faf9f7",
};

export default async function Image() {
  const h = await headers();
  const tenant = h.get("x-tenant") || "rohlax";
  const og = TENANT_OG[tenant] || DEFAULT_OG;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: og.bg,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Decorative border */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: `1px solid rgba(250, 249, 247, 0.12)`,
            borderRadius: 16,
            display: "flex",
          }}
        />

        {/* Monogram badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            borderRadius: 14,
            backgroundColor: og.accent,
            marginBottom: 32,
          }}
        >
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 36,
              color: og.fg,
              letterSpacing: -1,
            }}
          >
            {og.initials}
          </span>
        </div>

        {/* Site name */}
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 56,
            fontWeight: 400,
            color: og.fg,
            margin: 0,
            letterSpacing: -1,
          }}
        >
          {og.name}
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 24,
            color: `rgba(250, 249, 247, 0.6)`,
            margin: 0,
            marginTop: 16,
            letterSpacing: 0.5,
          }}
        >
          {og.tagline}
        </p>
      </div>
    ),
    { ...size }
  );
}
