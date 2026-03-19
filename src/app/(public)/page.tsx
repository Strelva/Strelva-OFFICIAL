import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Hero } from "@/components/public/Hero";
import { Services } from "@/components/public/Services";
import { BookingWidget } from "@/components/public/BookingWidget";
import { Story } from "@/components/public/Story";
import { Testimonials } from "@/components/public/Testimonials";
import { Events } from "@/components/public/Events";
import { Providers } from "@/components/public/Providers";
import { Contact } from "@/components/public/Contact";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tenant = await getTenantFromHeaders();
  const [hero, services, story, testimonials, events, providers, contact, settings] =
    await Promise.all([
      getContent("hero", tenant),
      getContent("services", tenant),
      getContent("story", tenant),
      getContent("testimonials", tenant),
      getContent("events", tenant),
      getContent("providers", tenant),
      getContent("contact", tenant),
      getContent("settings", tenant),
    ]);

  const prices = services.services.map((s) => parseInt(s.price || "0")).filter((p) => p > 0);
  const minServicePrice = prices.length > 0 ? String(Math.min(...prices)) : undefined;

  return (
    <>
      <a href="#services" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:text-sm" style={{ background: "var(--sage)", color: "var(--cream)" }}>
        Skip to services
      </a>
      <PageViewTracker />
      <main>
        <Hero hero={hero} ownerName={settings.ownerName} />

        {/* Trust strip */}
        <div
          className="py-5 md:py-6"
          style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
        >
          <div className="container-main">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
              <span>{settings.ownerTitle || "Wellness Professional"}</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>1-on-1 Sessions</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>{contact.address ? contact.address.split(",").slice(-2).join(",").trim() : "Virtual Available"}</span>
            </div>
          </div>
        </div>

        <Services services={services} />
        <BookingWidget
          services={services.services}
          bookingUrl={settings.bookingUrl}
          minPrice={minServicePrice}
          reviewCount={testimonials.testimonials.length}
        />
        <Story story={story} />
        <Testimonials testimonials={testimonials} />
        <Events events={events} />
        <Providers providers={providers} />
        <Contact contact={contact} />
      </main>
    </>
  );
}
