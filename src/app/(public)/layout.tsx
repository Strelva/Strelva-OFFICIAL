import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { Header } from "@/components/public/Header";
import { Footer } from "@/components/public/Footer";
import { getContent } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getTenantFromHeaders();
  const [settings, contact] = await Promise.all([
    getContent("settings", tenant),
    getContent("contact", tenant),
  ]);

  return (
    <SmoothScrollProvider>
      <Header settings={settings} />
      {children}
      <Footer settings={settings} contact={contact} />
    </SmoothScrollProvider>
  );
}
