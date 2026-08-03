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

  test("le badge combo ne recouvre jamais la jauge du Boss", async ({ page }) => {
    const titles = [`E2E combo A ${Date.now()}`, `E2E combo B ${Date.now()}`];

    for (const title of titles) {
      await page.getByLabel("Ajouter une tâche").fill(title);
      await page.getByRole("button", { name: "Ajouter" }).click();
      await expect(page.getByText(title)).toBeVisible();
    }

    // Deux complétions rapprochées (< 15 min) montent le combo à x2.
    for (const title of titles) {
      await page.getByRole("checkbox", { name: new RegExp(title) }).click();
    }

    const badge = page.getByLabel(/Combo en cours/);
    await expect(badge).toBeVisible({ timeout: 10_000 });

    const badgeBox = await badge.boundingBox();
    const bossBox = await page
      .getByRole("progressbar", { name: /Vie du Boss/ })
      .boundingBox();
    if (!badgeBox || !bossBox) throw new Error("Badge ou jauge sans boîte englobante");

    const overlaps =
      badgeBox.x < bossBox.x + bossBox.width &&
      badgeBox.x + badgeBox.width > bossBox.x &&
      badgeBox.y < bossBox.y + bossBox.height &&
      badgeBox.y + badgeBox.height > bossBox.y;

    expect(overlaps, "le badge combo recouvre la jauge du Boss").toBe(false);
  });
});
