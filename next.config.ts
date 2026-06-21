import type { NextConfig } from "next";

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : "*.supabase.co";

// Content-Security-Policy restricts which origins can receive data from the
// browser, blocking most data-exfiltration paths even if XSS is found later.
// `unsafe-inline` + `unsafe-eval` for script/style are required by Next.js
// (inline event handlers, Turbopack HMR in dev, Tailwind's inline styles).
// The high-value directives here are connect-src, frame-ancestors, base-uri,
// form-action, and object-src — these provide real protection regardless.
const cspValue = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  "worker-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy",   value: cspValue },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  // X-Frame-Options is superseded by frame-ancestors in CSP above, kept for
  // legacy browsers that don't support CSP.
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
    // Tree-shake icon and chart imports — ships only what's used
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
    ],
    // Keep prefetched route data alive for 5 minutes — covers a typical
    // admin session of jumping between pages. Without this, prefetches expire
    // in 30s and clicks re-fetch the RSC payload.
    staleTimes: { dynamic: 300, static: 600 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
