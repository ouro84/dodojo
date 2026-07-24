import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// US-07 : clôturer la journée (Dernier Round) écrit un day_result et
// affiche le récap figé. Testable via l'UI sans triche horaire (tout le jour même).
test.describe("Dernier Round (US-07)", () => {
  let title: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (!title) return;
    // Reload pour écarter un éventuel overlay récap avant nettoyage.
    await page.reload();
    await abandonViaUi(page, title);
    title = undefined;
  });

  // Chemin nominal : le Boss du jour reste vivant (au moins la tâche créée n'est
  // pas validée), donc la clôture produit une "retraite". Prouve le câblage
  // complet bouton → closeDay → day_result → recap. L'issue "victory" exige un
  // Boss à 0 (toutes les tâches du jour validées) : impossible de façon fiable
  // sur le compte e2e fixe partagé (ADR-04, cf. CLAUDE.md), qui accumule des
  // centaines de tâches du jour au fil des runs. La bascule victory/retreat est
  // couverte en unitaire (summarizeDay).
  test("retraite : clôturer avec le Boss vivant → récap retreat + day_result", async ({ page }) => {
    title = `E2E crep retreat ${Date.now()}`;
    await page.getByLabel("Ajouter une tâche").fill(title);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    await page.getByRole("button", { name: "Dernier Round" }).click();

    const recap = page.getByRole("dialog", { name: "Dernier Round" });
    await expect(recap).toBeVisible();
    await expect(recap).toHaveAttribute("data-outcome", "retreat");
    await recap.getByRole("button", { name: "Continuer" }).click();
  });

  test.fixme(
    "victoire : Boss à 0 → récap victory (nécessite un compte e2e isolé)",
    async ({ page }) => {
      // Prérequis : un compte e2e isolé (ou une route de seed reset) permettant
      // de vider l'Arène et de mettre le Boss à 0. Non disponible avec le compte
      // fixe partagé. Logique victory couverte en unitaire (summarizeDay).
      title = `E2E crep victory ${Date.now()}`;
      await page.getByLabel("Ajouter une tâche").fill(title);
      await page.getByRole("button", { name: "Ajouter" }).click();
      const row = page.locator("li", { hasText: title });
      await row.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Dernier Round" }).click();
      const recap = page.getByRole("dialog", { name: "Dernier Round" });
      await expect(recap).toHaveAttribute("data-outcome", "victory");
    },
  );
});
