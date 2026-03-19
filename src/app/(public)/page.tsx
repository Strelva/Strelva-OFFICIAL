import { getContent } from "@/lib/storage";
import { Hero } from "@/components/public/Hero";
import { Services } from "@/components/public/Services";
import { Booking } from "@/components/public/Booking";
import { Story } from "@/components/public/Story";
import { Testimonials } from "@/components/public/Testimonials";
import { Events } from "@/components/public/Events";
import { Providers } from "@/components/public/Providers";
import { Contact } from "@/components/public/Contact";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [hero, services, story, testimonials, events, providers, contact, settings] =
    await Promise.all([
      getContent("hero"),
      getContent("services"),
      getContent("story"),
      getContent("testimonials"),
      getContent("events"),
      getContent("providers"),
      getContent("contact"),
      getContent("settings"),
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
        <Hero hero={hero} />

        {/* Trust strip */}
        <div
          className="py-5 md:py-6"
          style={{ background: "var(--cream-dark)", borderBottom: "1px solid var(--cream-mid)" }}
        >
          <div className="container-main">
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[0.625rem] font-medium tracking-[0.15em] uppercase" style={{ color: "var(--bark-faded)" }}>
              <span>Physical Therapist</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>10+ Years Healthcare</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>1-on-1 Sessions</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>Williamsville, NY</span>
              <span style={{ color: "var(--cream-mid)" }}>|</span>
              <span>LGBTQIA+ Friendly</span>
            </div>
          </div>
        </div>

        <Services services={services} />
        <Booking vagaroUrl={settings.vagaroUrl} minPrice={minServicePrice} reviewCount={testimonials.testimonials.length} />
        <Story story={story} />
        <Testimonials testimonials={testimonials} />
        <Events events={events} />
        <Providers providers={providers} />
        <Contact contact={contact} />
      </main>
    </>
  );
}
