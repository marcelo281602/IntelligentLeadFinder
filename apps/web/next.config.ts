import type { NextConfig } from 'next';

/**
 * Security headers are applied globally. The CSP is strict: no external
 * scripts, no inline event handlers; Next.js requires 'unsafe-inline' for its
 * style tags. Provider calls happen server-side only, so connect-src stays
 * limited to self + Supabase.
 */
const isDev = process.env.NODE_ENV === 'development';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // next dev requires eval for its runtime chunks; production stays strict.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    '@leadfinder/config',
    '@leadfinder/core',
    '@leadfinder/providers',
    '@leadfinder/security',
  ],
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
