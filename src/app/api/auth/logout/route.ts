import { NextResponse } from "next/server";

// Auth is now handled by Clerk
export async function POST() {
  return NextResponse.json(
    { error: "Auth moved to Clerk. Use Clerk's sign-out." },
    { status: 410 }
  );
}
