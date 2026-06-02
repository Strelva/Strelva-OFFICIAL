export default function PrivacyPage() {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-16">
      <h1
        className="text-[28px] font-semibold mb-8"
        style={{ color: "var(--m-text)" }}
      >
        Privacy Policy
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
          Strelva (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
          operates the AI website management platform at strelva.com. This
          Privacy Policy explains how we collect, use, and protect your
          information.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Information We Collect
        </h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Account Information:</strong> Name, email address, business
            name, and billing information when you sign up.
          </li>
          <li>
            <strong>Website Content:</strong> Text, images, and other content
            you provide for your website.
          </li>
          <li>
            <strong>Usage Data:</strong> How you interact with our platform,
            including chat messages with our AI agent.
          </li>
          <li>
            <strong>Analytics:</strong> Visitor statistics for your website
            (page views, referrers, etc.).
          </li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          How We Use Your Information
        </h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>To build, host, and manage your website</li>
          <li>To process your subscription payments</li>
          <li>To send weekly performance reports</li>
          <li>To improve our AI agent and platform</li>
          <li>To communicate with you about your account</li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Data Sharing
        </h2>
        <p>
          We do not sell your personal information. We share data only with:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Payment processors (Stripe) to handle billing</li>
          <li>Hosting providers (Vercel) to serve your website</li>
          <li>Analytics services to generate your performance reports</li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Data Security
        </h2>
        <p>
          We use industry-standard security measures including encryption in
          transit (TLS) and at rest. Access to customer data is restricted to
          authorized personnel only.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Your Rights
        </h2>
        <p>You may request to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate information</li>
          <li>Delete your account and associated data</li>
          <li>Export your website content</li>
        </ul>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Cookies
        </h2>
        <p>
          We use essential cookies for authentication and session management.
          We use analytics cookies to understand how visitors use your website.
          You can control cookie preferences in your browser settings.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Changes to This Policy
        </h2>
        <p>
          We may update this policy from time to time. We will notify you of
          significant changes via email or through the platform.
        </p>

        <h2
          className="text-[18px] font-medium pt-4"
          style={{ color: "var(--m-text)" }}
        >
          Contact
        </h2>
        <p>
          Questions about this policy? Email us at{" "}
          <a
            href="mailto:jacob@strelva.com"
            className="underline hover:opacity-80"
            style={{ color: "var(--m-accent)" }}
          >
            jacob@strelva.com
          </a>
        </p>
      </div>
    </div>
  );
}
