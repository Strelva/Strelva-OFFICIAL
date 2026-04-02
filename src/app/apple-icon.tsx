import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const TENANT_ICONS: Record<string, { initials: string; bg: string; fg: string }> = {
  rohlax: { initials: "RW", bg: "#7c9a8e", fg: "#faf9f7" },
  gldf: { initials: "GL", bg: "#5a260c", fg: "#faf8f5" },
};

const DEFAULT_ICON = { initials: "R", bg: "#3d3229", fg: "#faf9f7" };

export default async function AppleIcon() {
  const h = await headers();
  const tenant = h.get("x-tenant") || "rohlax";
  const icon = TENANT_ICONS[tenant] || DEFAULT_ICON;

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 36,
          backgroundColor: icon.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 90,
            color: icon.fg,
            letterSpacing: -2,
          }}
        >
          {icon.initials}
        </span>
      </div>
    ),
    { ...size }
  );
}
