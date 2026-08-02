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
  const unchecked = page.getByRole("checkbox", { checked: false });
  for (let guard = 0; guard < 20; guard += 1) {
    const count = await unchecked.count();
    if (count === 0) break;
    await unchecked.first().click();
    await expect(unchecked).toHaveCount(count - 1, { timeout: 10_000 });
  }
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
