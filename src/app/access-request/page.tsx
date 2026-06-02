import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Request your free site",
  description: "Tell Strelva where to send updates and what your local business needs online.",
};

export default function Page() {
  return <AccessRequestPage />;
}
