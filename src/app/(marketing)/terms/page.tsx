import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Scaffold Web",
  description: "Terms and conditions for using Scaffold Web.",
};

export default function TermsPage() {
  return (
    <section className="px-6 py-20" style={{ background: "var(--m-bg)" }}>
      <div className="max-w-[640px] mx-auto">
        <h1
          className="text-[28px] font-medium tracking-[-0.02em] mb-8"
          style={{ color: "var(--m-text)" }}
        >
          Terms of Service
        </h1>
        <div className="space-y-6 text-[15px] leading-[1.7]" style={{ color: "var(--m-text-2)" }}>
          <p>
            <strong style={{ color: "var(--m-text)" }}>Last updated:</strong> April 2026
          </p>
          <p>
            By using Scaffold Web, you agree to these terms. Please read them carefully.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Service Description
          </h2>
          <p>
            Scaffold Web provides AI-powered website management for small businesses. We build and
            maintain your website, generate content, and provide weekly reports on performance.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Pricing & Billing
          </h2>
          <p>
            Scaffold Web costs $149/month, billed monthly. You may cancel at any time. Custom website
            builds are billed separately as a one-time fee. All payments are processed through
            Stripe.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Your Content
          </h2>
          <p>
            You retain ownership of all content you provide to Scaffold Web. By using the service, you
            grant us permission to display and modify your content as needed to operate your
            website.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            AI-Generated Content
          </h2>
          <p>
            Scaffold Web uses AI to generate and update website content. While we review outputs for
            quality, you are responsible for verifying that published content is accurate and
            appropriate for your business.
          </p>

          <h2 className="text-[18px] font-medium pt-4" style={{ color: "var(--m-text)" }}>
            Limitation of Liability
          </h2>
          <p>
            Scaffold Web is provided &quot;as is&quot; without warranties. We are not liable for indirect,
            incidental, or consequential damages arising from your use of the service.
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
