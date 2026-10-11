import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Request your build",
  description:
    "Strelva Agency builds your site, manages it for you, and sends a weekly plain-English recap. You own everything. Runs on Strelva.",
};

export default function Page() {
  return <AccessRequestPage />;
}
