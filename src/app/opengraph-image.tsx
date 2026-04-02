import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Rohlax Wellness — Wellness Services in Buffalo, NY";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          backgroundColor: "#3d3229",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle decorative border */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: "1px solid rgba(250, 249, 247, 0.12)",
            borderRadius: 16,
            display: "flex",
          }}
        />

        {/* RW monogram */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            borderRadius: 14,
            backgroundColor: "#7c9a8e",
            marginBottom: 32,
          }}
        >
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 36,
              color: "#faf9f7",
              letterSpacing: -1,
            }}
          >
            RW
          </span>
        </div>

        {/* Site name */}
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 56,
            fontWeight: 400,
            color: "#faf9f7",
            margin: 0,
            letterSpacing: -1,
          }}
        >
          Rohlax Wellness
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 24,
            color: "rgba(250, 249, 247, 0.6)",
            margin: 0,
            marginTop: 16,
            letterSpacing: 0.5,
          }}
        >
          Wellness Services in Buffalo, NY
        </p>
      </div>
    ),
    {
      ...size,
    }
  );
}
