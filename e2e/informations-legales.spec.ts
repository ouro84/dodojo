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

  test("accessible depuis Le Vestiaire (utilisateur connecté)", async ({ page }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Informations légales/ }).click();
    await page.waitForURL("/informations-legales");
    await expect(page.getByRole("link", { name: "Mentions légales" })).toBeVisible();
  });

  // Pas de login() ici : proxy.ts redirige tout utilisateur déjà connecté
  // loin de /welcome (cf. lib/supabase/middleware.ts) — ce test doit rester
  // anonyme pour vérifier le lien tel qu'un visiteur avant inscription le voit.
  test("lien CGU/confidentialité visible depuis l'inscription (visiteur anonyme)", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await expect(page.getByRole("link", { name: "CGU" })).toBeVisible();
    await expect(page.getByRole("link", { name: "politique de confidentialité" })).toBeVisible();
  });
});
