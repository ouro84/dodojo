import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Audit #67, PR5 : durcissement de base — pas de CSP stricte ici (risque
  // de casser next/og/Satori et les intégrations OAuth/MCP sans campagne de
  // test dédiée), laissée en dette explicite pour un futur audit HTTP.
  async redirects() {
    return [
      // Issue #100 : renommage routes post-rebranding "Démon Intérieur".
      // Routes historiques conservées en redirect 301 pour ne pas casser
      // deep-links externes, indexation SEO, et bookmarks existants.
      { source: "/qg", destination: "/vestiaire", permanent: true },
      { source: "/qg/:path*", destination: "/vestiaire/:path*", permanent: true },
      { source: "/echoppe", destination: "/marche-noir", permanent: true },
      { source: "/echoppe/:path*", destination: "/marche-noir/:path*", permanent: true },
      { source: "/pantheon", destination: "/tableau-de-chasse", permanent: true },
      { source: "/pantheon/:path*", destination: "/tableau-de-chasse/:path*", permanent: true },
    ];
  },
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
