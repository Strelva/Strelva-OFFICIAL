import { NextResponse } from "next/server";
import { requireTenantAccess } from "@/lib/auth";
import { requireTenantFromHeaders } from "@/lib/tenant";
import { getClickCountsByPrefix } from "@/lib/storage";

/**
 * Derive a week-over-week trend from the data available.
 * getClickCountsByPrefix exposes `thisWeek` (last7) and `total`.
 * "down" fires when there is historical activity (total > thisWeek) but zero
 * this week. "up" fires when all recorded activity falls within this week
 * (everything is recent). Otherwise "flat".
 */
function deriveTrend(thisWeek: number, total: number): "up" | "down" | "flat" {
  if (thisWeek === 0 && total > 0) return "down";
  if (thisWeek > 0 && thisWeek === total) return "up";
  return "flat";
}

export async function GET() {
  const tenant = await requireTenantFromHeaders();

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
        trend: deriveTrend(heroCta.thisWeek, heroCta.total),
      };
    }

    // Services section - aggregate all service clicks
    const serviceClicksList = Object.entries(serviceClicks);
    if (serviceClicksList.length > 0) {
      const totalServiceClicks = serviceClicksList.reduce((sum, [, data]) => sum + data.thisWeek, 0);
      const totalServiceAll = serviceClicksList.reduce((sum, [, data]) => sum + data.total, 0);
      const sortedServices = serviceClicksList
        .map(([key, data]) => ({ name: key.replace("service-click:", ""), ...data }))
        .sort((a, b) => b.thisWeek - a.thisWeek);

      analytics.services = {
        clicks: totalServiceClicks,
        trend: deriveTrend(totalServiceClicks, totalServiceAll),
        topService: sortedServices[0]?.name,
      };
    }

    // Contact section clicks
    const contactClicks = sectionClicks["section-click:contact"];
    if (contactClicks) {
      analytics.contact = {
        clicks: contactClicks.thisWeek,
        trend: deriveTrend(contactClicks.thisWeek, contactClicks.total),
      };
    }

    // Story/about section (usually viewed but not clicked)
    const storyClicks = sectionClicks["section-click:story"];
    if (storyClicks) {
      analytics.story = {
        views: storyClicks.thisWeek,
        trend: deriveTrend(storyClicks.thisWeek, storyClicks.total),
      };
    }

    // Testimonials - typically has high view time
    const testimonialClicks = sectionClicks["section-click:testimonials"];
    if (testimonialClicks) {
      analytics.testimonials = {
        views: testimonialClicks.thisWeek,
        trend: deriveTrend(testimonialClicks.thisWeek, testimonialClicks.total),
      };
    }

    // FAQ section
    const faqClicks = sectionClicks["section-click:faq"];
    if (faqClicks) {
      analytics.faq = {
        clicks: faqClicks.thisWeek,
        trend: deriveTrend(faqClicks.thisWeek, faqClicks.total),
      };
    }

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Failed to fetch section analytics:", error);
    return NextResponse.json({});
  }
}
