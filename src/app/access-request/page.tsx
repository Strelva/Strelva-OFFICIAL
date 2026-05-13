import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Request private beta access",
  description: "Tell Scaffold Web what you want handled first and request private beta access.",
};

export default function Page() {
  return <AccessRequestPage />;
}
