import type { Metadata } from "next";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";

export const metadata: Metadata = {
  title: "Open your account or choose an agency",
  description:
    "Open your business or agency account on Strelva, or choose an agency to do the work.",
};

export default function Page() {
  return <AccessRequestPage />;
}
