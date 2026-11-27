import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  /** L-1233: /collab/[token] の HTML 応答にも Referrer-Policy（metadata と併用） */
  async headers() {
    return [
      {
        source: "/collab/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
