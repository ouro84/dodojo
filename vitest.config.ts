import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Issue #201 : le defaut vitest (5 s) est trop court pour cette suite. Les
    // tests qui echouent ne sont pas lents *logiquement* — ils font un
    // `await import(...)` d'un module lourd (route handler Next + Supabase +
    // Inngest) DANS le corps du test, donc le cout de transformation/import
    // tombe a l'interieur de la region chronometree. Mesure sur 2 runs
    // complets : `import` cumule 225 s puis 275 s pour ~190 s de mur, et 3 a 6
    // tests depassent 5 s par run — jamais les memes (route.test.ts,
    // ArtisansCarousel.test.tsx...), ce qui exclut un test fautif en
    // particulier. 15 s laisse 3x de marge sans rien couter aux tests qui
    // passent : un timeout n'est pas un delai paye, seulement un plafond.
    testTimeout: 15_000,
    include: [
      "lib/**/*.test.ts",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
      "hooks/**/*.test.tsx",
    ],
  },
});
