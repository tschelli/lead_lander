/** @type {import('next').NextConfig} */
const adminProxyTarget =
  process.env.ADMIN_API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

const normalizedAdminProxyTarget = adminProxyTarget.replace(/\/$/, "");
const adminProxyBase = normalizedAdminProxyTarget.endsWith("/api")
  ? normalizedAdminProxyTarget
  : `${normalizedAdminProxyTarget}/api`;

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${adminProxyBase}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
