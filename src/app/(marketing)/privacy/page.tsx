import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Scaffold Web",
  description: "How Scaffold Web handles your data.",
};

export default function PrivacyPage() {
  return (
    <section className="px-6 py-20" style={{ background: "var(--m-bg)" }}>
      <div className="max-w-[640px] mx-auto">
        <h1
          className="text-[28px] font-medium tracking-[-0.02em] mb-8"
          style={{ color: "var(--m-text)" }}
        >
          Privacy Policy
        </h1>
        <div className="space-y-6 text-[15px] leading-[1.7]" style={{ color: "var(--m-text-2)" }}>
          <p>
            <strong style={{ color: "var(--m-text)" }}>Last updated:</strong> April 2026
          </p>
          <p>
            Scaffold Web (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the scaffoldweb.com platform. This page
            explains how we collect, use, and protect your information.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Information We Collect
          </h2>
          <p>
            When you use Scaffold Web, we collect information you provide directly: your name, email,
            business details, and website content. We also collect usage data like page views
            and feature interactions to improve the service.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            How We Use Your Information
          </h2>
          <p>
            We use your information to operate and improve Scaffold Web — generating content for your
            website, sending you weekly reports, and providing customer support. We do not
            sell your data to third parties.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Data Storage
          </h2>
          <p>
            Your data is stored securely using industry-standard encryption. Website content
            is hosted on Vercel. Authentication is handled by Clerk. Payments are processed
            by Stripe.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Your Rights
          </h2>
          <p>
            You can request access to, correction of, or deletion of your data at any time
            by emailing jacob@scaffoldweb.com.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Contact
          </h2>
          <p>
            Questions? Email us at{" "}
            <a href="mailto:jacob@scaffoldweb.com" className="underline" style={{ color: "var(--m-accent)" }}>
              jacob@scaffoldweb.com
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
