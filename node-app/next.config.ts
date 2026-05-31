/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Docker 이미지 최적화를 위한 standalone 옵션 추가 */
  output: "standalone",
  devIndicators: {
    allowedDevOrigins: ["http://dev.kenxin.org", "https://dev.kenxin.org"],
  },

  // Bypass ESLint and TypeScript checks during Docker build
  // since they are already validated in the host environment via deploy.sh
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
