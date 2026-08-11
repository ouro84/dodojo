import { test, expect } from "@playwright/test";
import {
  abandonViaUi,
  deleteTaskById,
  dismissKoOverlayIfPresent,
  login,
  resetHpDamageLocked,
  seedOverdueTask,
} from "./fixtures";

// Issue #50 : parcours de bout en bout traversant Le Réveil → Arène →
// Terminer la journée → Tableau de Chasse → Vestiaire, en plus des e2e "simplistes"
// existants (une feature isolée par fichier — cf. wake-up-ritual.spec.ts /
// crepuscule-recap.spec.ts, et aucune couverture Tableau de Chasse
// jusqu'ici). Compte e2e fixe partagé (ADR-04).
test.describe("Parcours : cycle complet d'une journée (issue #50)", () => {
  test("Le Réveil (reste résolu) → combat → Terminer la journée → Tableau de Chasse → Vestiaire", async ({
    page,
  }) => {
    const overdueTitle = `E2E parcours reste ${Date.now()}`;
    const taskTitle = `E2E parcours tâche ${Date.now()}`;
    const overdueId = await seedOverdueTask(overdueTitle);

    try {
      // 1. Connexion → Le Réveil, overlay bloquant (reste de la veille présent).
      await login(page);
      const ritual = page.getByRole("alertdialog", { name: "Le Réveil" });
      await expect(ritual).toBeVisible();
      await expect(ritual.getByText(overdueTitle)).toBeVisible();
      await ritual.getByLabel(`Terminé "${overdueTitle}"`).click();
      await expect(ritual).toBeHidden();

      // 2. Arène : combat du jour (ajout puis validation d'une tâche).
      const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
      const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));
      const initialCurrentHp = Number(await bossBar.getAttribute("aria-valuenow"));

      await page.getByLabel("Ajouter une tâche").fill(taskTitle);
      await page.getByRole("button", { name: "Ajouter" }).click();
      await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 20));

      await page.getByLabel(`Marquer "${taskTitle}" comme accomplie`).check();
      await expect(bossBar).toHaveAttribute("aria-valuenow", String(initialCurrentHp));

      // 3. Terminer la journée : clôture manuelle non-bloquante → day_result.
      // Le Boss (compte partagé) peut tomber à 0 sur ce coup et déclencher un
      // K.O. en direct (US-16). Deux raisons de le solder AVANT de cliquer le
      // bouton HUD, toutes deux introduites par l'issue #156 : (1) l'overlay
      // n'apparaît que ~2,4s après le coup fatal (DEATH_DURATION_MS +
      // KO_FADE_MS + KO_OVERLAY_EXTRA_DELAY_MS, lib/combat-animation.ts), donc
      // un `count()` immédiat le rate systématiquement ; (2) c'est désormais un
      // modal plein écran `fixed inset-0 z-50`, au-dessus de CrepusculeRecap
      // (`z-40`) — passer par son propre CTA « Terminer la journée » laisserait
      // le récap enfoui dessous et le clic « Continuer » ci-dessous serait
      // intercepté. `dismissKoOverlayIfPresent` gère l'apparition différée
      // (garde sur les HP du Boss puis `waitFor`) et ne fait rien s'il n'y a
      // pas de K.O.
      await dismissKoOverlayIfPresent(page);
      await page.getByRole("button", { name: "Terminer la journée", exact: true }).click();
      const recap = page.getByRole("dialog", { name: "Terminer la journée" });
      await expect(recap).toBeVisible();
      await expect(recap).toHaveAttribute("data-outcome", /victory|retreat|defeat/);
      await recap.getByRole("button", { name: "Continuer" }).click();

      // 4. Vestiaire → Tableau de Chasse : le jour clos apparaît au Journal de combat.
      // Pas de comparaison valeur-à-valeur avec le récap ci-dessus : celui-ci
      // est calculé côté client depuis le state `tasks` de l'Arène
      // (`summarizeDay`), le Journal lit le `day_result` réellement persisté
      // par le serveur — sur un compte e2e partagé accumulant des dizaines de
      // tâches au fil des runs, les deux peuvent diverger sans que ce soit un
      // bug (cf. crepuscule-recap.spec.ts, qui n'asserte pas non plus de
      // valeur fixe).
      await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: "Vestiaire" })
        .click();
      await page.waitForURL("/vestiaire");
      await expect(page.getByRole("heading", { name: "Le Vestiaire" })).toBeVisible();

      await page.getByRole("link", { name: "Tableau de Chasse" }).click();
      await page.waitForURL("/tableau-de-chasse");
      // Marge de timeout : première requête Supabase de la session (5 requêtes
      // parallèles côté serveur, cf. app/tableau-de-chasse/page.tsx) — observé une
      // fois au-delà du timeout par défaut (5s) sur connexion froide.
      await expect(page.getByRole("heading", { name: "Tableau de Chasse" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("li", { hasText: /dégâts/ }).first()).toBeVisible();

      // 5. Retour Vestiaire (BottomNav) : la navigation reste cohérente en fin de parcours.
      await page
        .getByRole("navigation", { name: "Navigation principale" })
        .getByRole("link", { name: "Vestiaire" })
        .click();
      await page.waitForURL("/vestiaire");
    } finally {
      await deleteTaskById(overdueId);
      // Issue #191 : "Terminé" verrouille le dégât sur profiles.hp_damage_locked
      // (deleteTaskById ne le touche pas) — sans ce reset, il fuit vers tous les
      // tests suivants du run qui supposent une jauge à 100.
      await resetHpDamageLocked();
      await page.goto("/");
      await abandonViaUi(page, taskTitle);
    }
  });
});
