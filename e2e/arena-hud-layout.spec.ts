import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Le projet Playwright par défaut tourne sur devices["Desktop Chrome"] (~1280px).
// `.screen-main` (app/globals.css) plafonne l'Arène à 28rem/42rem, ce qui laisse
// largement plus de place que le plancher min-content des deux colonnes : sur
// cette largeur, le bug ne se reproduit pas (vérifié — écart mesuré < 1 px sans
// le fix). Il est spécifiquement mobile : on force donc un viewport étroit,
// cohérent avec les captures de l'issue (~393 CSS px sur l'appareil d'origine).
test.use({ viewport: { width: 390, height: 844 } });

test.describe("HUD de l'Arène (issue #156)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("les jauges Héros et Boss ont exactement la même largeur", async ({ page }) => {
    const heroBar = page.getByRole("progressbar", { name: /Vie du héros/ });
    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });

    await expect(heroBar).toBeVisible();
    await expect(bossBar).toBeVisible();

    const heroBox = await heroBar.boundingBox();
    const bossBox = await bossBar.boundingBox();
    if (!heroBox || !bossBox) throw new Error("Jauge sans boîte englobante");

    // Tolérance 1 px : arrondi sub-pixel du moteur de rendu. Au-delà, c'est
    // une colonne qui a mangé l'espace de l'autre (régression #139/#152).
    expect(Math.abs(heroBox.width - bossBox.width)).toBeLessThanOrEqual(1);
  });
});
