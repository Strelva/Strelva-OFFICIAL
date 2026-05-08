import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { readJsonObject } from "@/lib/request-body";

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

export async function POST(req: Request) {
  try {
    if (await isRateLimitedAsync(rateLimitKey(req, "subscribe"), 5)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await readJsonObject(req);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, name } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const tenant = await getTenantFromHeaders();
    const result = await addSubscriber(
      email.trim().toLowerCase(),
      cleanText(name, 160),
      tenant
    );

    if (result.duplicate) {
      return NextResponse.json({ message: "You're already subscribed!" });
    }

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
