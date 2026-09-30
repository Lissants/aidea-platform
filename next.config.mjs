/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // SQL Server drivers are loaded with Node's own require at runtime rather
  // than bundled: msnodesqlv8 is a native (ODBC) addon, and tedious/mssql
  // use dynamic requires the bundler can't follow.
  serverExternalPackages: ['mssql', 'msnodesqlv8', 'tedious'],
};

export default nextConfig;
