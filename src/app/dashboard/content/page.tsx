import { redirect } from "next/navigation";
import { getContent, getSectionTimestamps } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { hasTenantAccess } from "@/lib/auth";
import { defaults } from "@/lib/defaults";
import { safeFetch } from "@/lib/utils";
import { buildSectionData } from "@/lib/buildSectionData";
import { ContentWorkspace } from "@/components/dashboard/ContentWorkspace";

export default async function ContentPage() {
  const tenant = await getTenantFromHeaders();
  const allowed = await hasTenantAccess(tenant);
  if (!allowed) redirect("/");

  const [hero, services, story, testimonials, events, providers, contact, settings, timestamps] =
    await Promise.all([
      safeFetch(() => getContent("hero", tenant), defaults.hero),
      safeFetch(() => getContent("services", tenant), defaults.services),
      safeFetch(() => getContent("story", tenant), defaults.story),
      safeFetch(() => getContent("testimonials", tenant), defaults.testimonials),
      safeFetch(() => getContent("events", tenant), defaults.events),
      safeFetch(() => getContent("providers", tenant), defaults.providers),
      safeFetch(() => getContent("contact", tenant), defaults.contact),
      safeFetch(() => getContent("settings", tenant), defaults.settings),
      safeFetch(() => getSectionTimestamps(tenant), {}),
    ]);

  const sectionData = buildSectionData(
    { hero, services, story, testimonials, events, providers, contact, settings },
    timestamps,
  );

  return (
    <ContentWorkspace
      siteName={settings.siteName || "Your Business"}
      ownerName={settings.ownerName || "there"}
      sectionData={sectionData}
      timestamps={timestamps}
    />
  );
}
