import type { Metadata } from "next";
import { StrelvaDemo } from "@/experience/app-frame/StrelvaDemo";
import { businessSignupReleaseEnabled } from "@/platform/business-signup-release";

export const metadata: Metadata = { title: "Strelva 1.0 demo", robots: { index: false, follow: false } };

/** Deliberately public, bounded fictional demo. No session, data read or preview gate. */
export default function DemoPage() {
  return <StrelvaDemo startHref={businessSignupReleaseEnabled() ? "/sign-up?as=business" : "/audit"} />;
}
