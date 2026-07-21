import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario : cocher/décocher une tâche propage sur sa hiérarchie parent/
// sous-tâches (2 niveaux, RG-01) — dans les deux sens. Chaque assertion
// compare au HP capturé juste avant l'action (pas à une baseline lointaine),
// pour rester robuste à toute activité concurrente sur le compte partagé.
test.describe("Cascade de complétion parent/sous-tâches", () => {
  const cleanupTitles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne les tâches créées par le test.
    for (const title of cleanupTitles.splice(0)) {
      await abandonViaUi(page, title);
    }
  });

  test("cocher toutes les sous-tâches coche le parent ; décocher une le décoche", async ({
    page,
  }) => {
    const titleR = `E2E R ${Date.now()}`;
    const titleS1 = `E2E S1 ${Date.now()}`;
    const titleS2 = `E2E S2 ${Date.now()}`;
    cleanupTitles.push(titleR, titleS1, titleS2);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const hpNow = async () => Number(await bossBar.getAttribute("aria-valuenow"));

    await page.getByLabel("Ajouter une tâche").fill(titleR);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByLabel(`Déplacer "${titleR}"`)).toBeEnabled();

    const rowR = page.locator("li", { hasText: titleR });
    await rowR.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(titleS1);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");
    await expect(page.getByLabel(`Déplacer "${titleS1}"`)).toBeEnabled();

    await rowR.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(titleS2);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");
    await expect(page.getByLabel(`Déplacer "${titleS2}"`)).toBeEnabled();

    // Locators scopés sur l'input de la ligne (pas sur l'aria-label
    // "comme accomplie/non accomplie", qui change avec l'état et casserait
    // le locator dès le premier toggle).
    const checkboxR = rowR.locator('input[type="checkbox"]');
    const checkboxS1 = page.locator("li", { hasText: titleS1 }).locator('input[type="checkbox"]');
    const checkboxS2 = page.locator("li", { hasText: titleS2 }).locator('input[type="checkbox"]');

    const beforeS1 = await hpNow();
    await checkboxS1.check();
    // S1 seule (10 HP) : le parent ne suit pas tant que S2 n'est pas complète.
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(beforeS1 - 10));
    await expect(checkboxR).not.toBeChecked();

    const beforeS2 = await hpNow();
    await checkboxS2.check();
    // S2 (10) + R auto-cochée (20) = 30 HP d'un coup.
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(beforeS2 - 30));
    await expect(checkboxR).toBeChecked();

    const beforeUncheck = await hpNow();
    await checkboxS1.uncheck();
    // R se décoche automatiquement (plus toutes ses sous-tâches complètes) :
    // R (20) + S1 (10) redeviennent actives, soit +30 HP restaurés.
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(beforeUncheck + 30));
    await expect(checkboxR).not.toBeChecked();
  });

  test("cocher la tâche parente coche toutes ses sous-tâches", async ({ page }) => {
    const titleR = `E2E R ${Date.now()}`;
    const titleS1 = `E2E S1 ${Date.now()}`;
    const titleS2 = `E2E S2 ${Date.now()}`;
    cleanupTitles.push(titleR, titleS1, titleS2);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });

    await page.getByLabel("Ajouter une tâche").fill(titleR);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByLabel(`Déplacer "${titleR}"`)).toBeEnabled();

    const rowR = page.locator("li", { hasText: titleR });
    await rowR.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(titleS1);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");
    await expect(page.getByLabel(`Déplacer "${titleS1}"`)).toBeEnabled();

    await rowR.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(titleS2);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");
    await expect(page.getByLabel(`Déplacer "${titleS2}"`)).toBeEnabled();

    const checkboxR = rowR.locator('input[type="checkbox"]');
    const checkboxS1 = page.locator("li", { hasText: titleS1 }).locator('input[type="checkbox"]');
    const checkboxS2 = page.locator("li", { hasText: titleS2 }).locator('input[type="checkbox"]');

    const beforeCheck = Number(await bossBar.getAttribute("aria-valuenow"));
    await checkboxR.check();

    // R (20) + S1 (10) + S2 (10) = 40 HP d'un coup.
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(beforeCheck - 40));
    await expect(checkboxS1).toBeChecked();
    await expect(checkboxS2).toBeChecked();
  });
});
