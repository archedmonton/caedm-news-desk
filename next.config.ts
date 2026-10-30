import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js inline bootstrap scripts require 'unsafe-inline'; dev additionally needs 'unsafe-eval' for HMR.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'self'",
      "frame-ancestors 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // PGlite (local dev) loads its WASM/data files from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // The floating dev indicator sits over the sidebar's sign-out control.
  devIndicators: false,
  // Lets the Playwright server build into its own directory alongside a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The in-app user guide imports docs/USER-GUIDE.md as text, so the docs and the app can't drift apart.
  webpack(config) {
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
