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
    // dismiss 7s, issue #160) au moment de cette action — le test reste valide (le champ
    // doit être utilisable dans tous les cas), il ne prouve l'invariant
    // "pendant que visible" que sur un run assez rapide.
    const title = `E2E vs-intro ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText(title)).toBeVisible();

    await abandonViaUi(page, title);
  });

  test("le bust du boss en intro a la même orientation que son sprite en combat", async ({ page }) => {
    await login(page);
    const introBoss = page.locator('[data-testid="vs-intro-overlay"] img').nth(1);
    const introTransform = await introBoss.evaluate((el) => getComputedStyle(el).transform);

    await page.reload(); // fait disparaître l'intro (déjà jouée aujourd'hui), révèle la scène de combat
    // Le flip vit sur le nœud `role="img"` interne au SpriteAnimator
    // (`transform: scaleX(±1)`), pas sur le wrapper `character-sprite`
    // (celui-ci ne porte que `translateY`, cf. CharacterSprite.tsx).
    const combatBoss = page.locator('[data-testid="character-sprite"] [role="img"]').last();
    const combatTransform = await combatBoss.evaluate((el) => getComputedStyle(el).transform);

    // matrix(-1,0,0,1,0,0) si flip, matrix(1,0,0,1,0,0)/"none" sinon — on ne
    // compare pas le sprite gagnant lui-même (la scène de combat mélange
    // d'autres transforms de positionnement), seul le signe de l'axe X compte.
    const isFlipped = (t: string) => t.includes("-1,") || t.startsWith("matrix(-1");
    expect(isFlipped(introTransform)).toBe(isFlipped(combatTransform));
  });
});
