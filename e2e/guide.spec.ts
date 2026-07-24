import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Manuel du Dojo (issue #68)", () => {
  test("sommaire par catégorie, accessible depuis le QG", async ({ page }) => {
    await login(page);
    await page.goto("/qg");
    await page.getByRole("link", { name: /Manuel du Dojo/ }).click();
    await page.waitForURL("/guide");
    await expect(page.getByRole("heading", { name: "Manuel du Dojo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Combat" })).toBeVisible();
  });

  test("navigation vers un article et retour au sommaire", async ({ page }) => {
    await login(page);
    await page.goto("/guide");
    await page.getByRole("link", { name: "Le barème de combat" }).click();
    await page.waitForURL("/guide/hp");
    await expect(page.getByRole("heading", { name: "Le barème de combat" })).toBeVisible();
    await page.getByRole("link", { name: /Tout le Manuel/ }).click();
    await page.waitForURL("/guide");
  });

  test("slug inconnu renvoie une 404", async ({ page }) => {
    await login(page);
    const response = await page.goto("/guide/slug-inexistant");
    expect(response?.status()).toBe(404);
  });
});
