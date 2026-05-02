import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getTenantConfig } from "@/lib/tenants";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const DEFAULT_ICON = { initials: "S", bg: "#3d3229", fg: "#faf9f7" };

export default async function AppleIcon() {
  const h = await headers();
  const tenant = h.get("x-tenant") || "";

  let icon = DEFAULT_ICON;

  if (tenant) {
    const config = await getTenantConfig(tenant);
    if (config?.branding) {
      icon = {
        initials: config.branding.initials || config.siteName?.slice(0, 1) || DEFAULT_ICON.initials,
        bg: config.branding.accentColor || DEFAULT_ICON.bg,
        fg: config.branding.fgColor || DEFAULT_ICON.fg,
      };
    } else if (config) {
      icon = {
        ...DEFAULT_ICON,
        initials: config.siteName?.slice(0, 1) || DEFAULT_ICON.initials,
      };
    }
  }

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
