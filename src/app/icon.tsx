import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { getTenantConfig } from "@/lib/tenants";

export const runtime = "nodejs";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const DEFAULT_ICON = { initials: "S", bg: "#3d3229", fg: "#faf9f7" };

export default async function Icon() {
  const h = await headers();
  const tenant = h.get("x-tenant") || "";

  let icon = DEFAULT_ICON;
  let useScaffoldMark = !tenant;

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
    } else {
      useScaffoldMark = true;
    }
  }

  if (useScaffoldMark) {
    return new ImageResponse(
      (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            backgroundColor: "#171412",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 6,
              top: 7,
              width: 18,
              height: 14,
              border: "2px solid #faf9f7",
              borderRadius: 3,
              opacity: 0.92,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 9,
              top: 11,
              width: 12,
              height: 2,
              backgroundColor: "#8fb8a8",
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 17,
              top: 16,
              width: 8,
              height: 8,
              backgroundColor: "#faf9f7",
              transform: "rotate(45deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 21,
              top: 22,
              width: 8,
              height: 3,
              backgroundColor: "#faf9f7",
              borderRadius: 2,
              transform: "rotate(45deg)",
            }}
          />
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          backgroundColor: icon.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 16,
            color: icon.fg,
            letterSpacing: 0,
          }}
        >
          {icon.initials}
        </span>
      </div>
    ),
    { ...size }
  );
}
