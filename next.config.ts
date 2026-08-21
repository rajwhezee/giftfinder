import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Sent on every response.
 *
 * Vercel already terminates TLS and sends HSTS, and the API sets no CORS
 * headers so a browser will not let another origin read it. These cover what
 * is left. There is no auth, no session and no cookie anywhere in this app, so
 * the classic CSRF story does not apply — these are about what a *page* is
 * allowed to do and be embedded in.
 */
const securityHeaders = [
  // Clickjacking. Nothing here is meant to be framed by anyone.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser second-guessing a declared content type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Merchant links leave the site constantly; send the origin, never the path
  // and query, which would leak what the shopper searched for.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in this app asks for hardware.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // `unsafe-inline` on styles is unavoidable with Tailwind's runtime style
    // element and framer-motion writing inline transforms; scripts are the half
    // that matters and they are same-origin only. `img-src` lists the six
    // merchant CDNs the catalogue actually serves images from, matching
    // images.remotePatterns below.
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-eval' in development only. React's dev build uses eval() to
      // rebuild callstacks across the server/client boundary, and Next 16's
      // dev overlay leans on it harder than 15 did: without this the console
      // fills with EvalError and the page can stop responding to input.
      // Production never evaluates a string as script, so the deployed policy
      // is unchanged and still refuses it.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://images.unsplash.com https://i5.walmartimages.com https://i.etsystatic.com https://pisces.bbystatic.com https://cdn.shopify.com https://i.ebayimg.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "i5.walmartimages.com",
      },
      {
        protocol: "https",
        hostname: "i.etsystatic.com",
      },
      {
        protocol: "https",
        hostname: "pisces.bbystatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
      },
    ],
  },
};

export default nextConfig;
