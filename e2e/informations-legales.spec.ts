import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Pages légales (issue #134)", () => {
  test("les 3 pages sont accessibles sans session (visiteur anonyme)", async ({ page }) => {
    for (const path of ["/mentions-legales", "/confidentialite", "/cgu"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    }
  });

  test("mentions légales : contact et hébergeur visibles", async ({ page }) => {
    await page.goto("/mentions-legales");
    await expect(page.getByText("arnaud.solente+dodojo@gmail.com")).toBeVisible();
    await expect(page.getByText("Vercel Inc.")).toBeVisible();
  });

  test("confidentialité : mention cookies visible", async ({ page }) => {
    await page.goto("/confidentialite");
    await expect(page.getByText(/aucun bandeau de consentement/)).toBeVisible();
  });

  test("accessible depuis Le Vestiaire (utilisateur connecté) et depuis l'inscription", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Informations légales/ }).click();
    await page.waitForURL("/informations-legales");
    await expect(page.getByRole("link", { name: "Mentions légales" })).toBeVisible();

    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "CGU" })).toBeVisible();
  });
});
