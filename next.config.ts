import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mammoth (docx → HTML preview) pulls in Node-only deps; keep it external so
  // Next doesn't try to bundle it into the server build.
  serverExternalPackages: ["mammoth"],
};

export default nextConfig;
