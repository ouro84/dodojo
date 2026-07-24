import type { MetadataRoute } from "next";

// Convention native Next.js 16 (route générée, cachée par défaut). Couleurs
// alignées sur le token --color-bg d'app/globals.css (oklch(0.14 0.015 25)
// converti en sRGB) — l'app n'a qu'un seul thème (sombre), pas de valeur
// "inventée". Cf. DESIGN.md § 2 (Colors) pour la palette complète.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dodojo",
    short_name: "Dodojo",
    description: "Transforme ta liste de tâches en combat de boss d'arcade quotidien.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0706",
    theme_color: "#0f0706",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
