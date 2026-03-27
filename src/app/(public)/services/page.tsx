import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Services } from "@/components/public/Services";
import { BookingWidget } from "@/components/public/BookingWidget";
import { Testimonials } from "@/components/public/Testimonials";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Services | ${settings.siteName}`,
    description: `Explore wellness services offered by ${settings.siteName}. Book your session today.`,
  };
}

export default async function ServicesPage() {
  const tenant = await getTenantFromHeaders();
  const [services, testimonials, settings] = await Promise.all([
    getContent("services", tenant),
    getContent("testimonials", tenant),
    getContent("settings", tenant),
  ]);

  const prices = services.services.map((s) => parseInt(s.price || "0")).filter((p) => p > 0);
  const minServicePrice = prices.length > 0 ? String(Math.min(...prices)) : undefined;

  return (
    <>
      <PageViewTracker />
      <main>
        {/* Page header */}
        <div className="pt-32 md:pt-36" style={{ background: "var(--cream)" }} />

        <Services services={services} />
        <BookingWidget
          services={services.services}
          bookingUrl={settings.bookingUrl}
          minPrice={minServicePrice}
          reviewCount={testimonials.testimonials.length}
        />
        <Testimonials testimonials={testimonials} />
      </main>
    </>
  );
}
