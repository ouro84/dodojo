import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// Issue #50 : parcours bout-en-bout Arène → Le Marché Noir → Arène, vérifiant
// que l'achat/équipement d'un héros dans Le Marché Noir se reflète réellement
// dans l'Arène — jusqu'ici seul le comportement interne à /marche-noir était
// couvert (echoppe.spec.ts), jamais le retour visuel côté combat.
test.describe("Parcours : équiper un héros depuis Le Marché Noir se reflète dans l'Arène (issue #50)", () => {
  test.beforeEach(async () => {
    await resetShopState();
  });

  test.afterEach(async () => {
    await resetShopState();
  });

  test("Arène (Chevalier de Feu) → Le Marché Noir (achat Prêtresse de l'Eau) → Arène (sprite mis à jour)", async ({
    page,
  }) => {
    await login(page);
    // Issue #48 : CharacterSprite rend un <div role="img" aria-label="…">
    // (spritesheet en background-image), plus un <img alt="…"> — getByAltText
    // ne matcherait donc plus rien depuis la migration.
    await expect(page.getByRole("img", { name: "Ton héros : Chevalier de Feu" })).toBeVisible();

    await page.getByRole("link", { name: "Marché Noir" }).click();
    await page.waitForURL("/marche-noir");

    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /Équipé/ })).toBeVisible();

    await page.getByRole("link", { name: "Arène", exact: true }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("img", { name: "Ton héros : Prêtresse de l'Eau" })).toBeVisible();
  });
});
