import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getClickCountsByPrefix } from "@/lib/storage";

export async function GET() {
  const tenant = await getTenantFromHeaders();

  const denied = await requireTenantAccess(tenant);
  if (denied) return denied;

  try {
    // Fetch click data for various sections
    const [
      serviceClicks,
      sectionClicks,
    ] = await Promise.all([
      getClickCountsByPrefix("service-click:", tenant),
      getClickCountsByPrefix("section-click:", tenant),
    ]);

    // Build section analytics map
    const analytics: Record<string, {
      clicks?: number;
      views?: number;
      trend?: "up" | "down" | "flat";
      topService?: string;
    }> = {};

    // Hero section - track CTA clicks
    const heroCta = sectionClicks["section-click:hero-cta"];
    if (heroCta) {
      analytics.hero = {
        clicks: heroCta.thisWeek,
        trend: heroCta.thisWeek > 5 ? "up" : "flat",
      };
    }

    // Services section - aggregate all service clicks
    const serviceClicksList = Object.entries(serviceClicks);
    if (serviceClicksList.length > 0) {
      const totalServiceClicks = serviceClicksList.reduce((sum, [, data]) => sum + data.thisWeek, 0);
      const sortedServices = serviceClicksList
        .map(([key, data]) => ({ name: key.replace("service-click:", ""), ...data }))
        .sort((a, b) => b.thisWeek - a.thisWeek);

      analytics.services = {
        clicks: totalServiceClicks,
        trend: totalServiceClicks > 10 ? "up" : totalServiceClicks > 0 ? "flat" : undefined,
        topService: sortedServices[0]?.name,
      };
    }

    // Contact section clicks
    const contactClicks = sectionClicks["section-click:contact"];
    if (contactClicks) {
      analytics.contact = {
        clicks: contactClicks.thisWeek,
        trend: contactClicks.thisWeek > 3 ? "up" : "flat",
      };
    }

    // Story/about section (usually viewed but not clicked)
    // Use page scroll depth or time-on-section if available
    const storyClicks = sectionClicks["section-click:story"];
    if (storyClicks) {
      analytics.story = {
        views: storyClicks.thisWeek,
        trend: "flat",
      };
    }

    // Testimonials - typically has high view time
    const testimonialClicks = sectionClicks["section-click:testimonials"];
    if (testimonialClicks) {
      analytics.testimonials = {
        views: testimonialClicks.thisWeek,
        trend: "flat",
      };
    }

    // FAQ section
    const faqClicks = sectionClicks["section-click:faq"];
    if (faqClicks) {
      analytics.faq = {
        clicks: faqClicks.thisWeek,
        trend: faqClicks.thisWeek > 5 ? "up" : "flat",
      };
    }

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Failed to fetch section analytics:", error);
    return NextResponse.json({});
  }
}
