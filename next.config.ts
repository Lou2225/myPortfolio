import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isVercel = process.env.VERCEL === "1";

function resolveSupabaseImageHost(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = resolveSupabaseImageHost();
const supabaseImageOrigin = supabaseHost ? `https://${supabaseHost}` : "";

const globalCspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https://*.supabase.co${supabaseImageOrigin ? ` ${supabaseImageOrigin}` : ""}`,
  `media-src 'self' blob: data: https://*.supabase.co${supabaseImageOrigin ? ` ${supabaseImageOrigin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: https://*.supabase.co${supabaseImageOrigin ? ` ${supabaseImageOrigin}` : ""} https://psgc.gitlab.io`,
  "frame-src 'self' blob: https://drive.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isVercel ? ["upgrade-insecure-requests"] : []),
].join("; ");

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "*.supabase.co",
  },
  ...(supabaseHost
    ? [
        {
          protocol: "https" as const,
          hostname: supabaseHost,
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  images: {
    remotePatterns,
  },
  async headers() {
    return [
      {
        source: "/((?!api/resume).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: globalCspDirectives,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=()",
          },
        ],
      },
      {
        source: "/api/resume",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; object-src 'self'; frame-ancestors 'self'",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
