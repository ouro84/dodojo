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
    const heroCta = page.getByTestId("hero-cta");

    // Fire Knight équipé par défaut.
    await expect(heroCta).toHaveText("✓ Équipé");

    // Sélectionner un héros verrouillé et l'acheter.
    await page.locator('[data-hero-cell="water_priestess"]').click();
    await heroCta.click();
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Devient possédé → bouton Équiper.
    await expect(heroCta).toHaveText("Équiper");

    // Équiper.
    await heroCta.click();
    await expect(heroCta).toHaveText("✓ Équipé");
  });
});
