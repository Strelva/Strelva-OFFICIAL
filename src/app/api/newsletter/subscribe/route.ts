import { NextResponse } from "next/server";
import { addSubscriber } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const tenant = await getTenantFromHeaders();
    const result = await addSubscriber(email.trim().toLowerCase(), name, tenant);

    if (result.duplicate) {
      return NextResponse.json({ message: "You're already subscribed!" });
    }

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
