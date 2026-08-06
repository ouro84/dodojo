import { test, expect } from "@playwright/test";
import { login, abandonViaUi } from "./fixtures";

// Issue #135 — overlay décoratif, jamais bloquant. Aucune assertion sur le
// timing/les frames d'animation (cf. CLAUDE.md, piège de flake déjà documenté
// sur les animations de combat) : présence, non-interception des clics,
// non-rejeu au reload uniquement.
//
// `playwright.config.ts` force `reducedMotion: "reduce"` pour toute la suite
// (US-48) — VsIntroOverlay ne rend rien sous reduced-motion (comportement
// voulu, cf. spec), donc ce spec doit repasser en "no-preference" pour
// exercer réellement la séquence, même patron que combat-animations.spec.ts.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test.describe("Issue #135 — Intro VS/FIGHT!", () => {
  test("apparaît au premier chargement du jour, pas au reload", async ({ page }) => {
    await login(page);
    await expect(page.getByTestId("vs-intro-overlay")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("vs-intro-overlay")).toHaveCount(0);
  });

  test("ne bloque pas la saisie de tâche pendant qu'il est potentiellement visible", async ({
    page,
  }) => {
    await login(page);
    // Note : sur un runner lent, l'overlay peut déjà avoir disparu (auto-
    // dismiss 5s) au moment de cette action — le test reste valide (le champ
    // doit être utilisable dans tous les cas), il ne prouve l'invariant
    // "pendant que visible" que sur un run assez rapide.
    const title = `E2E vs-intro ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await abandonViaUi(page, title);
  });
});
