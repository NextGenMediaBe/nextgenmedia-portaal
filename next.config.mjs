// Security response headers. Additive and conservative: these harden the app
// without changing any application behaviour. No Content-Security-Policy is set
// here on purpose — a strict CSP can silently break inline styles/scripts and
// third-party embeds, so it is intentionally left out to preserve stability.
const securityHeaders = [
  // Stop the site being framed (clickjacking protection).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't let browsers MIME-sniff responses away from the declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Only send the origin (not the full path) as referrer to other origins.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable powerful browser features the app doesn't use.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Force HTTPS for two years (browsers only honour this over HTTPS).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
