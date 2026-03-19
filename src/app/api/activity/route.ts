import { NextResponse } from "next/server";
import { getActivity } from "@/lib/storage";

export async function GET() {
  try {
    const activity = await getActivity();
    return NextResponse.json(activity);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
