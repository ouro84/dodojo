import { test, expect } from "@playwright/test";
import { abandonViaUi, deleteTaskById, login, seedOverdueTask } from "./fixtures";

// Issue #50 : parcours de bout en bout traversant Le Réveil → Arène →
// Dernier Round → Tableau de Chasse → QG, en plus des e2e "simplistes"
// existants (une feature isolée par fichier — cf. wake-up-ritual.spec.ts /
// crepuscule-recap.spec.ts, et aucune couverture Tableau de Chasse
// jusqu'ici). Compte e2e fixe partagé (ADR-04).
test.describe("Parcours : cycle complet d'une journée (issue #50)", () => {
  test("Le Réveil (reste résolu) → combat → Dernier Round → Tableau de Chasse → QG", async ({
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

      // 3. Dernier Round : clôture manuelle non-bloquante → day_result. Si le
      // Boss (compte partagé) tombe à 0 sur ce coup, un K.O. en direct (US-16)
      // s'affiche avec son propre CTA "🌙 Dernier Round" — sinon on utilise le
      // bouton HUD permanent (name exact, sans emoji).
      const koOverlay = page.getByRole("alertdialog", { name: /Boss vaincu/ });
      if (await koOverlay.count()) {
        await koOverlay.getByRole("button", { name: /Dernier Round/ }).click();
      } else {
        await page.getByRole("button", { name: "Dernier Round", exact: true }).click();
      }
      const recap = page.getByRole("dialog", { name: "Dernier Round" });
      await expect(recap).toBeVisible();
      await expect(recap).toHaveAttribute("data-outcome", /victory|retreat|defeat/);
      await recap.getByRole("button", { name: "Continuer" }).click();

      // 4. QG → Tableau de Chasse : le jour clos apparaît au Journal de combat.
      // Pas de comparaison valeur-à-valeur avec le récap ci-dessus : celui-ci
      // est calculé côté client depuis le state `tasks` de l'Arène
      // (`summarizeDay`), le Journal lit le `day_result` réellement persisté
      // par le serveur — sur un compte e2e partagé accumulant des dizaines de
      // tâches au fil des runs, les deux peuvent diverger sans que ce soit un
      // bug (cf. crepuscule-recap.spec.ts, qui n'asserte pas non plus de
      // valeur fixe).
      await page.getByRole("link", { name: "QG" }).click();
      await page.waitForURL("/qg");
      await expect(page.getByRole("heading", { name: "Le Vestiaire" })).toBeVisible();

      await page.getByRole("link", { name: "Tableau de Chasse" }).click();
      await page.waitForURL("/pantheon");
      // Marge de timeout : première requête Supabase de la session (5 requêtes
      // parallèles côté serveur, cf. app/pantheon/page.tsx) — observé une fois
      // au-delà du timeout par défaut (5s) sur connexion froide.
      await expect(page.getByRole("heading", { name: "Tableau de Chasse" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator("li", { hasText: /dégâts/ }).first()).toBeVisible();

      // 5. Retour QG (BottomNav) : la navigation reste cohérente en fin de parcours.
      await page.getByRole("link", { name: "QG" }).click();
      await page.waitForURL("/qg");
    } finally {
      await deleteTaskById(overdueId);
      await page.goto("/");
      await abandonViaUi(page, taskTitle);
    }
  });
});
