import { defineConfig, devices } from "@playwright/test";

// Charge .env.local pour que le process Playwright (pas seulement `next dev`)
// connaisse E2E_TEST_EMAIL/E2E_TEST_PASSWORD (compte fixe, ADR-04). Absent en
// CI, où ces variables viennent directement des secrets GitHub Actions.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local absent (CI) — les variables sont déjà dans process.env.
}

// Port du serveur e2e. Défaut 3000 ; surchargeable (E2E_PORT) pour ne pas
// entrer en conflit avec un `next dev` déjà ouvert en local.
const PORT = process.env.E2E_PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Reset de l'état de combat du compte fixe avant la suite (cf. e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  // Exécution SÉRIE volontaire. Tous les tests partagent l'unique compte e2e
  // fixe (ADR-04) : en parallèle ils muteraient le même état (tâches, boss du
  // jour) et interféreraient (nav qui traîne sous charge, contrôles restés
  // disabled). Bug reproduit : 9/9 vert en série, ~6-8/9 KO dès 4 workers.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Neutralise toutes les animations de combat (issue #48) : sous
    // prefers-reduced-motion, le gating temporel est désactivé et jauges,
    // chiffres et overlays redeviennent instantanés — le comportement sur
    // lequel toute la suite existante a été écrite. Le seul spec qui teste
    // les animations le surcharge localement. `reducedMotion` n'est pas une
    // option aplatie sur `use` dans cette version de @playwright/test — elle
    // passe par `contextOptions` (BrowserContextOptions).
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Serveur de PRODUCTION (routes précompilées) et non `next dev`. En CI le
    // serveur démarre à froid : `next dev` compilerait `/login` à la demande sur
    // la 1re navigation et dépasserait le timeout. Un serveur prod sert des
    // routes déjà compilées, donc la 1re nav est immédiate.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: baseURL,
    // Local : réutilise un serveur déjà lancé sur ce port (itération rapide,
    // pas de rebuild). CI : toujours un serveur frais.
    reuseExistingServer: !process.env.CI,
    // Le build Next tourne pendant ce démarrage (plus lent en CI sans cache
    // .next) : timeout large.
    timeout: 240_000,
  },
});
