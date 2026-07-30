import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  distDir: process.env.PLAYWRIGHT_DIST_DIR || ".next",
  // The dev-tools badge defaults to bottom-left, where it sits on top of the
  // dashboard sidebar's account footer during local walks. Move it out of the
  // way. Dev-only — has no effect on a production build.
  devIndicators: { position: "bottom-right" },
  allowedDevOrigins: [
    "127.0.0.1",
    "gldf.localhost",
    "admin.gldf.localhost",
    "jada.localhost",
    "admin.jada.localhost",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: "",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
          // HSTS: force HTTPS (incl. tenant subdomains), protect against
          // SSL-strip/downgrade. Vercel terminates TLS but doesn't set this.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// Wrap with Sentry so production builds upload source maps + wire release/cron
// instrumentation. Upload only runs when SENTRY_AUTH_TOKEN + org/project are set
// (prod build env); locally and without a token it no-ops. `silent` keeps the
// build log clean when the token is absent.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
