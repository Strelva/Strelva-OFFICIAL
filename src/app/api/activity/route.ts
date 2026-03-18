import { NextResponse } from "next/server";
import { getActivity } from "@/lib/storage";

export async function GET() {
  const activity = await getActivity();
  return NextResponse.json(activity);
}
