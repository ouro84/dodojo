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
    // handleSetDeadline (Arena.tsx, fix #95) no-op silencieusement tant que la
    // tâche est encore optimistic (id "optimistic-*") — attendre que le vrai
    // id serveur ait remplacé l'id optimiste avant d'interagir avec la
    // deadline, sinon "Enregistrer" ne fait rien et l'assertion suivante ne
    // peut jamais devenir vraie.
    await expect(row.getByLabel(`Déplacer "${taskTitle}"`)).toBeEnabled({ timeout: 15_000 });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("14:00");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (14:00)`),
    ).toBeVisible({ timeout: 15_000 });

    // Issue #191 : "14:00" est une heure fixe qui peut déjà être passée au
    // moment du run (CI comme local). Le nettoyage de fin de test (afterEach,
    // abandonViaUi → rageQuitTask) verrouillerait alors -10 HP de façon
    // définitive sur cette tâche jamais supprimée (hp_penalty, cf.
    // hpPenaltyToLock) — une pollution permanente du compte e2e partagé pour
    // le reste du run. On efface la deadline avant l'abandon, comme le test
    // suivant le fait déjà pour vérifier l'effacement.
    await row.getByLabel(`Modifier la deadline de "${taskTitle}" (14:00)`).click();
    await page.getByRole("button", { name: "Effacer" }).click();
    await expect(row.getByLabel(`Fixer une deadline pour "${taskTitle}"`)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("effacer une deadline la retire de la tâche", async ({ page }) => {
    taskTitle = `E2E deadline clear ${Date.now()}`;

    await page.getByLabel("Ajouter une tâche").fill(taskTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const row = page.locator("li", { hasText: taskTitle });
    // Cf. commentaire du test précédent : attendre l'id réel avant toute
    // interaction avec la deadline (handleSetDeadline no-op sur id optimistic).
    await expect(row.getByLabel(`Déplacer "${taskTitle}"`)).toBeEnabled({ timeout: 15_000 });
    await row.getByLabel(`Fixer une deadline pour "${taskTitle}"`).click();
    await page.getByLabel("Heure limite").fill("09:15");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(
      row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`),
    ).toBeVisible({ timeout: 15_000 });

    await row.getByLabel(`Modifier la deadline de "${taskTitle}" (09:15)`).click();
    await page.getByRole("button", { name: "Effacer" }).click();

    await expect(row.getByLabel(`Fixer une deadline pour "${taskTitle}"`)).toBeVisible({
      timeout: 15_000,
    });
  });
});
