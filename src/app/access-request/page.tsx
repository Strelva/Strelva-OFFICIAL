import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Join the free website waitlist",
  description: "Tell Scaffold Web the first website workflow your local business wants handled.",
};

export default function Page() {
  return <AccessRequestPage />;
}
