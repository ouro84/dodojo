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

    // Fire Knight équipé par défaut.
    await expect(page.getByRole("button", { name: /Équipé/ })).toBeVisible();

    // Sélectionner un héros verrouillé et l'acheter.
    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Devient possédé → bouton Équiper.
    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();

    // Équiper.
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /Équipé/ })).toBeVisible();
  });
});
