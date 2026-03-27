import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { Contact } from "@/components/public/Contact";
import { PageCTA } from "@/components/public/PageCTA";
import { PageViewTracker } from "@/components/public/PageViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const tenant = await getTenantFromHeaders();
  const settings = await getContent("settings", tenant);
  return {
    title: `Contact | ${settings.siteName}`,
    description: `Get in touch with ${settings.siteName}. Find our location, hours, and contact information.`,
  };
}

export default async function ContactPage() {
  const tenant = await getTenantFromHeaders();
  const contact = await getContent("contact", tenant);

  return (
    <>
      <PageViewTracker />
      <main>
        <div className="pt-32 pb-10 md:pt-36 md:pb-14" style={{ background: "var(--cream)" }}>
          <div className="container-main">
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight">
              Get in touch
            </h1>
          </div>
        </div>
        <Contact contact={contact} />
        <PageCTA />
      </main>
    </>
  );
}
