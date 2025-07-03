/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Docker 이미지 최적화를 위한 standalone 옵션 추가 */
  output: "standalone",
  devIndicators: {
    allowedDevOrigins: ["http://dev.kenxin.org", "https://dev.kenxin.org"],
  },
};

module.exports = nextConfig;
