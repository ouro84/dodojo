import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Le Guide (issue #68)", () => {
  test("sommaire par catégorie, accessible depuis Le Vestiaire", async ({ page }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Le Guide/ }).click();
    await page.waitForURL("/guide");
    await expect(page.getByRole("heading", { name: "Le Guide" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Combat" })).toBeVisible();
  });

  test("navigation vers un article et retour au sommaire", async ({ page }) => {
    await login(page);
    await page.goto("/guide");
    await page.getByRole("link", { name: "Le barème de combat" }).click();
    await page.waitForURL("/guide/hp");
    await expect(page.getByRole("heading", { name: "Le barème de combat" })).toBeVisible();
    await page.getByRole("link", { name: /Tout le Guide/ }).click();
    await page.waitForURL("/guide");
  });

  test("slug inconnu renvoie une 404", async ({ page }) => {
    await login(page);
    const response = await page.goto("/guide/slug-inexistant");
    expect(response?.status()).toBe(404);
  });
});
