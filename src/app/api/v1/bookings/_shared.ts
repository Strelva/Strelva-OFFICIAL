import { NextResponse } from "next/server";
import { createPublicWebsiteBookingService, PublicBookingError } from "@/products/scheduling/server";

export const BOOKING_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function bookingJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: BOOKING_HEADERS });
}

export function bookingOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: BOOKING_HEADERS });
}

export function bookingService() {
  return createPublicWebsiteBookingService();
}

export function bookingError(error: unknown): NextResponse {
  if (error instanceof PublicBookingError) return bookingJson({ error: error.message, code: error.code }, error.status);
  return bookingJson({ error: "Booking availability is temporarily unavailable." }, 503);
}

export function stringValue(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

export async function bodyObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text();
    if (!raw.trim() || raw.length > 30_000) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
