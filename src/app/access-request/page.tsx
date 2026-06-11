import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Request your build",
  description:
    "Strelva builds your site, manages it for you, and sends a weekly plain-English report. You own everything.",
};

export default function Page() {
  return <AccessRequestPage />;
}
