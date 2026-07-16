import type { NextConfig } from "next";

// Content-Security-Policy. Deliberately permissive on script/style ('unsafe-inline'
// / 'unsafe-eval') because Next's App Router hydration and Recharts' inline styles
// rely on them — tightening those needs nonces and would risk breaking the app.
// The high-value, non-breaking protections ARE enforced: frame-ancestors 'none'
// (clickjacking), object-src 'none', base-uri 'self', form-action 'self'. PDF/doc
// previews render in same-origin data:/blob: iframes, so those are allowed.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Google Fonts stylesheet (fonts.googleapis.com) + font files (fonts.gstatic.com).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https:",
  "frame-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // 2 years, include subdomains, preload — HTTPS only (Vercel is always HTTPS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // mammoth (docx → HTML preview) pulls in Node-only deps; keep it external so
  // Next doesn't try to bundle it into the server build.
  serverExternalPackages: ["mammoth"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
