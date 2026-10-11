import { NextResponse } from "next/server";
import { escapeEmailHtml } from "@/platform/infra/email/layout";

export function reconnectPage(message: string, status = 200, token?: string): NextResponse {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reconnect Google · Strelva</title></head><body><main><h1>Reconnect Google</h1><p>${escapeEmailHtml(message)}</p>${token ? `<form method="post"><input type="hidden" name="token" value="${escapeEmailHtml(token)}"><button type="submit">Continue to Google</button></form>` : ""}</main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
  });
}

