export default function TermsPage() {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-16">
      <h1
        className="text-[28px] font-semibold mb-8"
        style={{ color: "var(--m-text)" }}
      >
        Terms of Service
      </h1>

      <div
        className="space-y-6 text-[15px] leading-relaxed"
        style={{ color: "var(--m-text-2)" }}
      >
        <p>
          <strong style={{ color: "var(--m-text)" }}>Effective Date:</strong>{" "}
          April 30, 2026
        </p>

        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of Scaffold
          Web&apos;s AI website management platform. By using our service, you
          agree to these Terms.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          The Service
        </h2>
        <p>
          Scaffold Web provides AI-powered website management for small
          businesses. This includes website hosting, content updates via our AI
          agent, weekly performance reports, and ongoing maintenance.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Subscription and Billing
        </h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            The service costs $149 per month, billed monthly via Stripe.
          </li>
          <li>
            Custom website builds are quoted separately and billed as one-time
            fees.
          </li>
          <li>
            You may cancel at any time. Cancellation takes effect at the end of
            your current billing period.
          </li>
          <li>
            Refunds are provided at our discretion for service issues within
            your control.
          </li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Your Content
        </h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            You retain ownership of all content you provide (text, images,
            logos, etc.).
          </li>
          <li>
            You grant us a license to host, display, and modify your content as
            needed to provide the service.
          </li>
          <li>
            You are responsible for ensuring you have rights to all content you
            provide.
          </li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Acceptable Use
        </h2>
        <p>You agree not to use Scaffold Web to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Host illegal, harmful, or fraudulent content</li>
          <li>Infringe on intellectual property rights</li>
          <li>Distribute malware or spam</li>
          <li>Violate any applicable laws or regulations</li>
        </ul>
        <p className="pt-2">
          We reserve the right to suspend or terminate accounts that violate
          these terms.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Service Availability
        </h2>
        <p>
          We strive for high uptime but do not guarantee uninterrupted service.
          We are not liable for losses caused by temporary service
          interruptions, including scheduled maintenance.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Limitation of Liability
        </h2>
        <p>
          To the maximum extent permitted by law, Scaffold Web&apos;s liability
          is limited to the amount you paid for the service in the 12 months
          preceding any claim. We are not liable for indirect, incidental, or
          consequential damages.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Termination
        </h2>
        <p>
          Either party may terminate this agreement at any time. Upon
          termination:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Your website will be taken offline</li>
          <li>
            You may request an export of your content within 30 days of
            cancellation
          </li>
          <li>We will delete your data within 90 days unless legally required to retain it</li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Changes to Terms
        </h2>
        <p>
          We may modify these Terms with 30 days notice. Continued use after
          changes take effect constitutes acceptance of the new Terms.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Governing Law
        </h2>
        <p>
          These Terms are governed by the laws of the State of California,
          without regard to conflict of law principles.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Contact
        </h2>
        <p>
          Questions about these Terms? Email us at{" "}
          <a
            href="mailto:jacob@scaffoldweb.com"
            className="underline hover:opacity-80"
            style={{ color: "var(--m-accent)" }}
          >
            jacob@scaffoldweb.com
          </a>
        </p>
      </div>
    </div>
  );
}
