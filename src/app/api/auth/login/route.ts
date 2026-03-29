import { NextResponse } from "next/server";

// Auth is now handled by Clerk — redirect to sign-in page
export async function POST() {
  return NextResponse.json(
    { error: "Auth moved to Clerk. Use /sign-in instead." },
    { status: 410 }
  );
}
