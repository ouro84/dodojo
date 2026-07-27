import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// US-53 : parcours tenues. Compte e2e fixe partagé → reset avant chaque test.
test.describe("US-53 Tenues", () => {
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await login(page);
  });

  test("la bande tenues est grisée sur un héros verrouillé", async ({ page }) => {
    await page.goto("/marche-noir");
    await page.locator('[data-hero-cell="water_priestess"]').click();
    const swatch = page.locator('[data-skin-swatch="water_priestess_ember"]');
    await expect(swatch).toBeDisabled();
  });

  test("achète puis équipe une tenue du héros par défaut", async ({ page }) => {
    await page.goto("/marche-noir");
    // Fire Knight (possédé par défaut) déjà sélectionné/équipé.
    const swatch = page.locator('[data-skin-swatch="fire_knight_shadow_purple"]');
    await expect(swatch).toHaveAttribute("data-owned", "false");

    await swatch.click();
    await page.getByRole("dialog", { name: "Confirmer l'achat de la tenue" }).waitFor();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(swatch).toHaveAttribute("data-owned", "true");
    // Re-tap = équiper (déjà possédée).
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
  });

  test("la tenue par défaut n'est jamais achetable", async ({ page }) => {
    await page.goto("/marche-noir");
    const defaultSwatch = page.locator('[data-skin-swatch="fire_knight_default"]');
    await expect(defaultSwatch).toHaveAttribute("data-owned", "true");
  });
});
