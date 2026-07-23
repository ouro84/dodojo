import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario US-05 : fixer une deadline horaire sur une tâche via le popover ⏰.
// Pas de test sur le déclenchement de l'Attaque Surprise (polling temporisé,
// fragile en e2e) — couvert par les tests unitaires purs (lib/game-engine :
// missedDeadlineTasks, upcomingDeadlineCount, calculateHeroHp pondéré).
test.describe("Deadlines horaires (US-05)", () => {
  let taskTitle: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (taskTitle) await abandonViaUi(page, taskTitle);
    taskTitle = undefined;
  });

  test("fixer une deadline depuis le popover ⏰ l'affiche sur la tâche", async ({ page }) => {
    taskTitle = `E2E deadline ${Date.now()}`;

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const row = page.locator("li", { hasText: taskTitle });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("14:00");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (14:00)`),
    ).toBeVisible();
  });

  test("effacer une deadline la retire de la tâche", async ({ page }) => {
    taskTitle = `E2E deadline clear ${Date.now()}`;

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const row = page.locator("li", { hasText: taskTitle });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("09:15");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`),
    ).toBeVisible();

    await row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`).click();
    await page.getByRole("button", { name: "Effacer" }).click();

    await expect(row.getByLabel(`Fixer une deadline pour "${taskTitle}"`)).toBeVisible();
  });
});
