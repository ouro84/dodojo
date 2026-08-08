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
  // Exécution SÉRIE en local (1 seul compte e2e configuré, ADR-04) ; 4 workers
  // en CI, un compte Supabase dédié par worker (`E2E_TEST_EMAIL`/`_2`/`_3`/`_4`,
  // secrets CI, cf. e2e/fixtures.ts) — chaque fichier de spec tourne dans un
  // seul worker donc dans un seul compte, plus d'interférence inter-worker.
  // Avant cette isolation, tous les tests partageaient l'unique compte e2e fixe
  // et se marchaient dessus en parallèle (tâches, boss du jour mutés par
  // plusieurs workers à la fois) — bug reproduit : 9/9 vert en série, ~6-8/9 KO
  // dès 4 workers sur un compte unique. `workers:4` est calé sur les 4 vCPU du
  // runner `ubuntu-latest` (pas de sur-souscription).
  fullyParallel: !!process.env.CI,
  workers: process.env.CI ? 4 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Runner GitHub Actions ~1.5-2x plus lent que le poste local (constaté sur
  // les deux premiers runs CI réels de la suite, 2026-08-02 : 16-19min contre
  // 9.5min en local pour les mêmes 52 tests) — jamais mesuré avant faute d'un
  // job E2E qui allait jusqu'au bout en CI (cf. CLAUDE.md, fix Node 20→24).
  // Le timeout par défaut (30s) échouait alors de façon déterministe (pas du
  // bruit : 3 tentatives consécutives, mêmes tests) sur des attentes qui
  // passent en ~15-20s en local. Doublé pour absorber cet écart de matériel.
  timeout: process.env.CI ? 60_000 : 30_000,
  // `timeout` ci-dessus est le budget PAR TEST ; il ne touche pas le timeout
  // des assertions, qui reste au défaut Playwright de 5s tant qu'on ne pose pas
  // `expect.timeout`. Relever l'un sans l'autre laisse échouer toute assertion
  // placée juste après une server action lente : mesuré sur le run CI
  // 30768754776, le POST de `closeDay` (≥ 10 aller-retours Supabase
  // séquentiels, dont `assembleAchievementContext`) a mis **5 853 ms** depuis un
  // runner en région `iad` — 853 ms de trop, et `journey-full-day.spec.ts`
  // échouait de façon déterministe (3 tentatives, même signature
  // `element(s) not found`) sur le récap qui n'était pas encore monté.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
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
    // Le build Next tourne pendant ce démarrage, d'où un plafond large. Ce
    // n'est PAS un délai payé à chaque run : Playwright rend la main dès que
    // `url` répond, donc relever cette valeur ne ralentit aucun run qui passe —
    // elle évite seulement de tuer un build qui progresse encore. Pas de
    // variante `process.env.CI` pour cette raison, et parce que le côté lent
    // est le poste local, pas la CI : mesuré sur le run 30768754776, la CI met
    // **29 s** pour prebuild + build + start + globalSetup (le job `checks`
    // construit en 17 s), là où le même build dépasse 240 s sur un poste
    // Windows (antivirus + worktree avec son propre node_modules).
    //
    // Le dépassement ne se contentait pas d'échouer proprement : le
    // `npm run build` tué à mi-parcours laissait `.next` incomplet, et le run
    // SUIVANT échouait sur « Could not find a production build in the '.next'
    // directory » — un message qui pointe vers un build absent plutôt que vers
    // le timeout qui l'a interrompu.
    timeout: 600_000,
  },
});
