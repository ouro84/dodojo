import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

test.describe("Les Artisans (issue #134)", () => {
  test("accessible depuis Le Vestiaire, affiche le premier artisan et ses tabs", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/vestiaire");
    await page.getByRole("link", { name: /Les Artisans/ }).click();
    await page.waitForURL("/vestiaire/artisans");
    await expect(page.getByRole("heading", { name: "Les Artisans" })).toBeVisible();
    await expect(page.getByTestId("artisan-position")).toHaveText("1/6");
    await expect(page.getByRole("tab", { name: "Héros" })).toBeVisible();
  });

  test("navigation vers la catégorie Police affiche BoldPixels", async ({ page }) => {
    await login(page);
    await page.goto("/vestiaire/artisans");
    await page.getByRole("tab", { name: "Police" }).click();
    await expect(page.getByText("BoldPixels")).toBeVisible();
    await expect(page.getByText(/CC BY-SA 4.0/)).toBeVisible();
  });
});
