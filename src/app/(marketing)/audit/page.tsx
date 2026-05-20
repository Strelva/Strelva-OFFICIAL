import type { Metadata } from "next";
import { AuditPage } from "@/components/marketing/AuditPage";

export const metadata: Metadata = {
  title: "Free Site Health Audit",
  description:
    "Get an instant health score for your website. Check speed, SEO, mobile experience, structured data, security, and accessibility — free.",
};

export default function Page() {
  return <AuditPage />;
}
