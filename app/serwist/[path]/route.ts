import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";
import { resolveBuildRevision } from "@/lib/pwa/build-revision";

// Un identifiant par build (SHA Vercel en prod, SHA git en local) partagé
// par toutes les entrées ci-dessous : à chaque déploiement, ces entrées
// changent, le SW passe en "waiting", et le toast de mise à jour (Tâche 5)
// se déclenche.
const revision = resolveBuildRevision(process.env.VERCEL_GIT_COMMIT_SHA, () => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  return result.status === 0 ? result.stdout.trim() : null;
});

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    useNativeEsbuild: true,
    additionalPrecacheEntries: [
      { url: "/offline", revision },
      { url: "/fonts/boldpixels.woff2", revision },
      { url: "/fonts/boldpixels.woff", revision },
      { url: "/manifest.webmanifest", revision },
    ],
  });
