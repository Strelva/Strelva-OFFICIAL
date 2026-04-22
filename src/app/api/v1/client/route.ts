import { NextRequest, NextResponse } from "next/server";
import { withAPIAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  return withAPIAuth(req, async (client) => {
    const features = [];

    // Features based on plan
    switch (client.plan) {
      case "scale":
        features.push("social_media", "advanced_analytics");
      // falls through
      case "growth":
        features.push("blog", "reviews", "email_campaigns");
      // falls through
      case "starter":
        features.push("website", "chat", "suggestions", "reports");
        break;
    }

    return NextResponse.json({
      id: client.id,
      name: client.name,
      plan: client.plan,
      features,
      active: client.active,
    });
  });
}
