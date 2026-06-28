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
            borderRadius: 7,
            backgroundColor: "#171412",
            display: "flex",
            position: "relative",
          }}
        >
          {/* Strelva cairn: a sage pebble above three stacked stones */}
          <div style={{ position: "absolute", left: 13.5, top: 4, width: 5, height: 5, borderRadius: "50%", backgroundColor: "#8fb8a8" }} />
          <div style={{ position: "absolute", left: 11.5, top: 10.5, width: 9, height: 5, borderRadius: "50%", backgroundColor: "#faf9f7" }} />
          <div style={{ position: "absolute", left: 9.5, top: 16, width: 13, height: 5.5, borderRadius: "50%", backgroundColor: "#faf9f7" }} />
          <div style={{ position: "absolute", left: 7.5, top: 22, width: 17, height: 6, borderRadius: "50%", backgroundColor: "#faf9f7" }} />
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
