import SmoothScrollProvider from "@/components/providers/SmoothScrollProvider";
import { Header } from "@/components/public/Header";
import { Footer } from "@/components/public/Footer";
import { getContent } from "@/lib/storage";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, contact] = await Promise.all([
    getContent("settings"),
    getContent("contact"),
  ]);

  return (
    <SmoothScrollProvider>
      <Header settings={settings} />
      {children}
      <Footer settings={settings} contact={contact} />
    </SmoothScrollProvider>
  );
}
