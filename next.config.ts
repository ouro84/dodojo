import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Audit #67, PR5 : durcissement de base — pas de CSP stricte ici (risque
  // de casser next/og/Satori et les intégrations OAuth/MCP sans campagne de
  // test dédiée), laissée en dette explicite pour un futur audit HTTP.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
