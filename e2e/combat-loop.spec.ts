import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Scénario ADR-04 : Connexion (compte e2e fixe) -> Ajout tâche -> Coche tâche
// -> Vérification de la baisse des HP du Boss.
test.describe("Boucle de combat quotidienne (ADR-04)", () => {
  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne la tâche créée par le test
    // pour ne pas faire grossir indéfiniment le Boss du compte e2e fixe.
    if (!taskTitle) return;
    const abandonButton = page.getByLabel(`Abandonner "${taskTitle}"`);
    if (await abandonButton.count()) {
      await abandonButton.click();
    }
    taskTitle = undefined;
  });

  test("ajouter une tâche soigne le Boss, la cocher lui inflige des dégâts", async ({ page }) => {
    taskTitle = `E2E ${Date.now()}`;

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));
    const initialCurrentHp = Number(await bossBar.getAttribute("aria-valuenow"));

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    // US-06 : +20 HP max et actuels à l'ajout.
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));
    await expect(bossBar).toHaveAttribute("aria-valuenow", String(initialCurrentHp + 20));

    // US-21 : cocher la tâche inflige 20 HP de dégâts (les HP max ne bougent pas).
    await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();

    await expect(bossBar).toHaveAttribute("aria-valuenow", String(initialCurrentHp));
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));
  });
});
