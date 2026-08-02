import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Ancres cibles posées par VersusScene (issue #156).
const HERO_TARGET = 0.25;
const BOSS_TARGET = 0.75;
// Tolérance : la silhouette n'est pas parfaitement symétrique dans son idleBox
// et le drop-shadow élargit légèrement la boîte mesurée.
const TOLERANCE = 0.03;

test.describe("Ancrage des sprites dans l'Arène (issue #156)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("héros à 25 % et Boss à 75 % de la scène, quel que soit le héros", async ({ page }) => {
    const scene = page.getByRole("img", { name: /Le Boss du jour/ }).locator("xpath=ancestor::div[contains(@class,'h-48')][1]");
    const sceneBox = await scene.boundingBox();
    if (!sceneBox) throw new Error("Scène sans boîte englobante");

    // Le positionneur (`sprite-anchor-*`) porte `left: 25%/75%` PUIS
    // `transform: translateX(-idleAnchorX × 100%)`. Son bord gauche mesuré
    // (box.x) est donc déjà décalé de idleAnchorX × largeur vers la gauche —
    // le centre géométrique de la boîte ne retombe sur la cible que si
    // idleAnchorX valait 0.5, ce qui n'est vrai pour aucun personnage ici. On
    // relit la fraction réellement appliquée dans le style inline et on
    // reconstruit le point d'ancrage exact : box.x + idleAnchorX × largeur.
    for (const [testid, target] of [
      ["sprite-anchor-hero", HERO_TARGET],
      ["sprite-anchor-boss", BOSS_TARGET],
    ] as const) {
      const locator = page.getByTestId(testid);
      const box = await locator.boundingBox();
      if (!box) throw new Error(`${testid} sans boîte englobante`);

      const transform = await locator.evaluate((el) => (el as HTMLElement).style.transform);
      const match = /translateX\((-?[\d.]+)%\)/.exec(transform);
      if (!match) throw new Error(`${testid} : transform inattendu "${transform}"`);
      const idleAnchorRatio = -Number(match[1]) / 100;

      const anchorX = box.x + idleAnchorRatio * box.width;
      const anchorRatio = (anchorX - sceneBox.x) / sceneBox.width;
      expect(
        Math.abs(anchorRatio - target),
        `${testid} : ancre à ${(anchorRatio * 100).toFixed(1)}%, attendu ${target * 100}%`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});
