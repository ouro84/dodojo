import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// Issue #50 : parcours bout-en-bout Arène → Échoppe → Arène, vérifiant que
// l'achat/équipement d'un héros dans l'Échoppe se reflète réellement dans
// l'Arène — jusqu'ici seul le comportement interne à /echoppe était couvert
// (echoppe.spec.ts), jamais le retour visuel côté combat.
test.describe("Parcours : équiper un héros depuis l'Échoppe se reflète dans l'Arène (issue #50)", () => {
  test.beforeEach(async () => {
    await resetShopState();
  });

  test.afterEach(async () => {
    await resetShopState();
  });

  test("Arène (Chevalier de Feu) → Échoppe (achat Prêtresse de l'Eau) → Arène (sprite mis à jour)", async ({
    page,
  }) => {
    await login(page);
    await expect(page.getByAltText("Ton héros : Chevalier de Feu")).toBeVisible();

    await page.getByRole("link", { name: "Échoppe" }).click();
    await page.waitForURL("/echoppe");

    await page.locator('[data-hero-cell="water_priestess"]').click();
    await page.getByRole("button", { name: /Débloquer/ }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByRole("button", { name: "Équiper" })).toBeVisible();
    await page.getByRole("button", { name: "Équiper" }).click();
    await expect(page.getByRole("button", { name: /Équipé/ })).toBeVisible();

    await page.getByRole("link", { name: "Arène" }).click();
    await page.waitForURL("/");
    await expect(page.getByAltText("Ton héros : Prêtresse de l'Eau")).toBeVisible();
  });
});
