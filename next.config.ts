import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  reactStrictMode: true,
  // Server files import TypeScript sources with a .js suffix (NodeNext style).
  // Webpack maps those requests back to the .ts files. The build script uses --webpack.
  experimental: {
    extensionAlias: {
      ".js": [".tsx", ".ts", ".js"],
    },
    // Default is 10 MB. A 10 MB video is ~14 MB of base64 JSON, so the proxy
    // was truncating the body and the send failed before WhatsApp saw it.
    proxyClientMaxBodySize: "32mb",
  },
  // Clinic uploads and PDFs run in the Node runtime, not a static export.
  serverExternalPackages: [
    "postgres",
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
    "pdfkit",
    "mysql2",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
