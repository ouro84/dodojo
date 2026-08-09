import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// US-18 : parcours Marché Noir. Compte e2e fixe partagé → reset avant chaque test.
test.describe("US-18 Le Marché Noir", () => {
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await login(page);
  });

  test("débloque puis équipe un héros", async ({ page }) => {
    await page.goto("/marche-noir");

    // Fire Knight possédé/équipé par défaut : aucun CTA d'achat héros.
    await expect(page.getByTestId("hero-cta")).toHaveCount(0);

    // Sélectionner un héros verrouillé et l'acheter.
    await page.locator('[data-hero-cell="water_priestess"]').click();
    const heroCta = page.getByTestId("hero-cta");
    await expect(heroCta).toContainText("Débloquer");
    await heroCta.click();
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Devient possédé → le CTA héros disparaît, l'équipement se fait via la tenue.
    await expect(heroCta).toHaveCount(0);
    const skinCta = page.getByTestId("skin-cta");
    await expect(skinCta).toHaveText("Équiper");

    await skinCta.click();
    await expect(skinCta).toHaveText("✓ Équipé");
  });
});
