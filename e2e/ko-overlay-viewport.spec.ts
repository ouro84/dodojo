import { expect, test, type Page } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Vide le Boss : on coche toutes les tâches actives du jour jusqu'au K.O.
async function knockOutBoss(page: Page, title: string): Promise<void> {
  await page.getByLabel("Ajouter une tâche").fill(title);
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // Une tâche à la fois, en re-résolvant la liste à chaque tour : cocher une
  // tâche déclenche un réordonnancement (reorderAfterCompletionToggle) qui
  // décale les positions dans le DOM — un index figé (.nth(i)) sur un compte
  // pris une seule fois pointe alors sur un autre élément après le 1er clic
  // (reproduit : la tâche fraîchement ajoutée restait décochée).
  // La condition de sortie est les HP du Boss, pas un compteur de tours. Le
  // `guard < 20` d'origine était la vraie cause du flake de ce fichier : le
  // compte e2e est partagé et accumule les tâches au fil des runs (RG-04
  // interdit tout DELETE), donc la liste dépasse depuis longtemps 20 entrées —
  // la boucle rendait la main avec le Boss encore debout et l'overlay
  // n'apparaissait jamais. Reproduit en local en mode CI : sortie à 20 tours
  // avec « Vie du Boss : 20 sur 480 », une tâche non cochée restante.
  // Le test échouait alors sur l'absence d'overlay, un symptôme sans rapport
  // apparent avec la borne de boucle.
  //
  // Sortir dès 0 HP est aussi ce qui évite le clic intercepté : à partir de là
  // l'overlay K.O. plein écran (`fixed inset-0 z-50`, issue #156) recouvre les
  // checkboxes restantes (`locator.click: Test ended.` en CI, run 30766684078).
  // Le `guard` ne reste qu'un garde-fou anti-boucle-infinie, volontairement
  // large.
  const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
  const unchecked = page.getByRole("checkbox", { checked: false });
  for (let guard = 0; guard < 200; guard += 1) {
    if ((await bossBar.getAttribute("aria-valuenow")) === "0") break;
    const count = await unchecked.count();
    if (count === 0) break;
    await unchecked.first().click();
    await expect(unchecked).toHaveCount(count - 1, { timeout: 10_000 });
  }
  // Échouer ici plutôt que de laisser le test échouer plus loin sur l'absence
  // d'overlay : le message pointe alors la vraie cause.
  await expect(bossBar, "le Boss n'est pas tombé à 0 HP, aucun K.O. à observer").toHaveAttribute(
    "aria-valuenow",
    "0",
  );
}

test.describe("Overlay K.O. (issue #156)", () => {
  let title: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    if (title) await abandonViaUi(page, title);
    title = undefined;
  });

  test("le titre et tous les contrôles tiennent dans le viewport", async ({ page }) => {
    title = `E2E ko overlay ${Date.now()}`;
    await knockOutBoss(page, title);

    const overlay = page.getByRole("alertdialog", { name: /Boss vaincu/ });
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Viewport indéfini");

    const targets = [
      overlay.getByText(/PERFECT|K\.?O\.?/i).first(),
      overlay.getByRole("button", { name: /Terminer la journée/ }),
      overlay.getByRole("button", { name: /Continuer le combat/ }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      if (!box) throw new Error("Élément de l'overlay sans boîte englobante");
      expect(box.y, "élément coupé en haut du viewport").toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        "élément coupé en bas du viewport",
      ).toBeLessThanOrEqual(viewport.height);
    }

    await overlay.getByRole("button", { name: /Continuer le combat/ }).click();
  });
});
