/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Allow the dev server to be opened from the LAN/VM address, not just
  // localhost. Without this Next.js blocks its dev resources (HMR, client
  // chunks) from that origin, so the page never hydrates.
  allowedDevOrigins: ['192.168.48.128'],
  // SQL Server drivers are loaded with Node's own require at runtime rather
  // than bundled: msnodesqlv8 is a native (ODBC) addon, and tedious/mssql
  // use dynamic requires the bundler can't follow.
  serverExternalPackages: ['mssql', 'msnodesqlv8', 'tedious'],
};

export default nextConfig;
