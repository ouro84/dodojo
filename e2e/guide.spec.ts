import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test("Manuel du Dojo (US-28) : accès depuis le QG", async ({ page }) => {
  await login(page);
  await page.goto("/qg");
  await page.getByRole("link", { name: /Manuel du Dojo/ }).click();
  await page.waitForURL("/guide");
  await expect(page.getByRole("heading", { name: "Manuel du Dojo" })).toBeVisible();
  await expect(page.locator("section")).not.toHaveCount(0);
});
