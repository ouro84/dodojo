import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// A2 (issue #101) — Popover breakdown pénalités Héros sur la HeroBar.
// Scénario Arène : on seed un reste via seedOverdueTask (cf. fixtures), on le
// reporte au Réveil pour le ramener en Arène (day_date = aujourd'hui), on
// tap la HeroBar → popover ouvert, contenu correct, re-tap → fermé.
// Second scénario Réveil : pas de aria-haspopup sur la jauge du Réveil
// (le composant WakeUpRitual a sa jauge inline, n'utilise pas HeroBar).
test.describe("A2 — Popover breakdown pénalités HeroBar", () => {
  test("ouvre le popover, vérifie le contenu breakdown, puis le referme", async ({ page }) => {
    // Note : on n'appelle pas seedOverdueTask ici — les e2e existants
    // reposent déjà sur un compte de test propre après globalSetup. On
    // similalement aucune tâche → "Aucune pénalité — prêt pour PERFECT" (cas 0 pénalité).
    await login(page);

    const heroBar = page.getByRole("progressbar", { name: /Vie du héros/ });
    // Le conteneur button parent porte aria-haspopup/aria-expanded.
    const heroButton = page.locator("button", { has: heroBar });

    // État initial : popover fermé.
    await expect(heroButton).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("dialog", { name: /Détail des HP du héros/ })).toHaveCount(0);

    // Ouverture.
    await heroButton.click();
    await expect(heroButton).toHaveAttribute("aria-expanded", "true");
    const popover = page.getByRole("dialog", { name: /Détail des HP du héros/ });
    await expect(popover).toBeVisible();
    // Aucune pénalité active → ligne rassurante.
    await expect(popover.getByText("Aucune pénalité — tu es prêt pour PERFECT")).toBeVisible();
    await expect(popover.getByText("Base")).toBeVisible();
    // "100" seul matcherait 3 éléments (100/100 ×2 et +100 de Base) → on
    // cible précisément la ligne "Base" qui affiche "+100".
    await expect(popover.getByText("+100", { exact: true })).toBeVisible();

    // Re-tap → ferme.
    await heroButton.click();
    await expect(heroButton).toHaveAttribute("aria-expanded", "false");
    await expect(popover).toBeHidden();

    // Nettoyage : abandonne la tâche qu'on a pu créer par ailleurs. Le test
    // ne crée aucune tâche mais d'autre tests en parallèle/SI ont pu en laisser.
  });

  test("grâce à seedOverdueTask + Report, on voit overdueCount dans le breakdown", async ({ page }) => {
    const { seedOverdueTask, deleteTaskById } = await import("./fixtures");
    const title = `E2E popover overdue ${Date.now()}`;
    const taskId = await seedOverdueTask(title);
    try {
      await login(page);

      const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
      await expect(ritual).toBeVisible();
      // Reporter le reste → la tâche arrive en Arène en tant que pénalité -20.
      await ritual.getByLabel(`Reporter "${title}"`).click();
      await expect(ritual).toBeHidden();

      const heroButton = page.locator("button", {
        has: page.getByRole("progressbar", { name: /Vie du héros/ }),
      });
      await heroButton.click();
      const popover = page.getByRole("dialog", { name: /Détail des HP du héros/ });
      await expect(popover).toBeVisible();
      // 1 reste reporté × -20 = -20 visible dans le breakdown.
      await expect(popover.getByText("Restes reportés")).toBeVisible();
      await expect(popover.getByText(/1\s*×\s*-20/)).toBeVisible();
      await expect(popover.getByText("Deadlines ratées")).toBeVisible();
    } finally {
      await deleteTaskById(taskId);
    }
  });

  test("la jauge Héros du Réveil n'a pas de popover (aria-haspopup absent)", async ({ page }) => {
    const { seedOverdueTask, deleteTaskById } = await import("./fixtures");
    const title = `E2E pas popover réveil ${Date.now()}`;
    const taskId = await seedOverdueTask(title);
    try {
      await login(page);

      const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
      await expect(ritual).toBeVisible();
      // Jauge inline du Réveil : role=progressbar + aria-label="Points de vie du Héros".
      const wakeUpBar = ritual.getByRole("progressbar", { name: "Points de vie du Héros" });
      await expect(wakeUpBar).toBeVisible();
      // Pas de aria-haspopup sur la jauge du Réveil (seule HeroBar en porte un).
      const hasPopup = await wakeUpBar.evaluate((el) =>
        el.closest("button")?.hasAttribute("aria-haspopup"),
      );
      expect(hasPopup).toBeFalsy();
      // Aucun dialog de breakdown dans le réveil.
      await expect(ritual.getByRole("dialog", { name: /Détail des HP du héros/ })).toHaveCount(0);

      // Nettoyage : termine le reste pour ne pas bloquer les tests suivants.
      await ritual.getByLabel(`Terminé "${title}"`).click();
      await expect(ritual).toBeHidden();
    } finally {
      // La tâche reste en base marquée complétée (pas de suppression defy RG-04,
      // mais c'est un utilitaire de test → on nettoie pour les runs suivants).
      await deleteTaskById(taskId);
    }
  });
});
