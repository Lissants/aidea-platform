import os from 'node:os';

/**
 * Origins allowed to open the dev server besides localhost. Without this
 * Next.js blocks its dev resources (HMR, client chunks) from a LAN address,
 * so the page never hydrates. Only affects `next dev`.
 *
 * Every IPv4 address of this machine is allowed automatically, so nothing is
 * hard-coded per machine. Extra hosts (a DNS name, a NAT/VM address, or a
 * wildcard such as 192.168.48.*) go in DEV_ALLOWED_ORIGINS, comma-separated.
 */
function devAllowedOrigins() {
  const local = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  const extra = (process.env.DEV_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...local, ...extra])];
}

/**
 * Security headers on every response. HSTS only in production: browsers then
 * refuse plain HTTP to this host for a year, which would break a localhost
 * dev server. IIS terminates HTTPS in front of Node (IIS_DEPLOYMENT.md).
 */
function securityHeaders() {
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ];
  if (process.env.NODE_ENV === 'production') {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  return headers;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: devAllowedOrigins(),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders() }];
  },
  // SQL Server drivers are loaded with Node's own require at runtime rather
  // than bundled: msnodesqlv8 is a native (ODBC) addon, and tedious/mssql
  // use dynamic requires the bundler can't follow.
  serverExternalPackages: ['mssql', 'msnodesqlv8', 'tedious'],
  // Uploaded files are runtime data (UPLOAD_DIR). lib/storage/local.ts falls
  // back to <cwd>/uploads, which file tracing would otherwise copy into the
  // standalone build.
  outputFileTracingExcludes: { '/*': ['./uploads/**/*'] },
};

export default nextConfig;
