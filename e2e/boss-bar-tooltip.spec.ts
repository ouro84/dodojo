import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Issue #159 — symétrique du popover HeroBar (A2, issue #101) côté Boss.
test.describe("Issue #159 — dialog de détail HP du Boss", () => {
  test("ouvre le dialog, vérifie le contenu, puis le referme", async ({ page }) => {
    await login(page);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const bossButton = page.locator("button", { has: bossBar });

    await expect(bossButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("dialog", { name: /Détail du Boss/ })).toHaveCount(0);

    await bossButton.click();
    await expect(bossButton).toHaveAttribute("aria-expanded", "true");
    const dialog = page.getByRole("dialog", { name: /Détail du Boss/ });
    await expect(dialog).toBeVisible();
    // Valeurs non figées (compte e2e partagé, cf. CLAUDE.md) : on vérifie les
    // libellés et la présence d'un nombre, pas une valeur exacte.
    await expect(dialog.getByText(/Tâches validées aujourd'hui/)).toBeVisible();
    await expect(dialog.getByText(/XP gagnée aujourd'hui/)).toBeVisible();
    await expect(dialog.getByText(/^\+\d+$/)).toBeVisible();

    await bossButton.click();
    await expect(bossButton).toHaveAttribute("aria-expanded", "false");
    await expect(dialog).toBeHidden();
  });

  test("le dialog reste dans le viewport (ancrage à droite)", async ({ page }) => {
    await login(page);
    const bossButton = page.locator("button", {
      has: page.getByRole("progressbar", { name: /Vie du Boss/ }),
    });
    await bossButton.click();
    const dialog = page.getByRole("dialog", { name: /Détail du Boss/ });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
