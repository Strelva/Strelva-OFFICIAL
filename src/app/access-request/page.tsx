import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Request a free site",
  description: "Tell Scaffold Web what site your local business needs.",
};

export default function Page() {
  return <AccessRequestPage />;
}
