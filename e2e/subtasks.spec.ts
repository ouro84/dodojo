import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario US-04 : une sous-tâche vaut 10 HP (au lieu de 20) et s'imbrique
// sous sa tâche parente.
test.describe("Sous-tâches à 2 niveaux (US-04)", () => {
  let rootTitle: string | undefined;
  let subtaskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne les tâches créées par le test.
    for (const title of [subtaskTitle, rootTitle]) {
      if (!title) continue;
      await abandonViaUi(page, title);
    }
    rootTitle = undefined;
    subtaskTitle = undefined;
  });

  test("créer une sous-tâche soigne le Boss de 10 HP au lieu de 20", async ({ page }) => {
    rootTitle = `E2E root ${Date.now()}`;
    subtaskTitle = `E2E sub ${Date.now()}`;

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    await page.getByLabel("Ajouter une tâche").fill(rootTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));

    const rootRow = page.locator("li", { hasText: rootTitle });
    await rootRow.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(subtaskTitle);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 30));
    await expect(page.locator("li", { hasText: subtaskTitle })).toBeVisible();
  });
});
