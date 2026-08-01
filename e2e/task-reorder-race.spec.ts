import { test, expect } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Issue #144 : régression de l'ordre des tâches — vérifie qu'après un
// rechargement complet (donc en lisant l'état réellement persisté en base,
// pas seulement l'état optimiste), l'ordre attendu est bien celui obtenu.
test.describe("Ordre des tâches persiste après reorder (issue #144)", () => {
  const cleanupTitles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    for (const title of cleanupTitles.splice(0)) {
      await abandonViaUi(page, title);
    }
  });

  test("cocher deux tâches racines rapprochées : les deux se retrouvent en bas après reload", async ({
    page,
  }) => {
    const titleA = `E2E ORD-A ${Date.now()}`;
    const titleB = `E2E ORD-B ${Date.now()}`;
    cleanupTitles.push(titleA, titleB);

    await page.getByLabel("Ajouter une tâche").fill(titleA);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByLabel("Ajouter une tâche").fill(titleB);
    await page.getByRole("button", { name: "Ajouter" }).click();

    const rowA = page.locator("li", { hasText: titleA });
    const rowB = page.locator("li", { hasText: titleB });
    await expect(rowA.locator('input[type="checkbox"]')).toBeVisible();
    await expect(rowB.locator('input[type="checkbox"]')).toBeVisible();

    // Coche rapprochée (< 200ms d'intervalle) — le scénario qui déclenche la
    // race condition en l'absence de sérialisation.
    await rowA.locator('input[type="checkbox"]').check();
    await rowB.locator('input[type="checkbox"]').check();

    // Attend la résolution des deux mutations (drag handle réactivé).
    await expect(page.getByLabel(`Déplacer "${titleA}"`)).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel(`Déplacer "${titleB}"`)).toBeEnabled({ timeout: 15_000 });

    // Reload complet : on ne vérifie plus l'état optimiste, mais l'état
    // réellement persisté en base.
    await page.reload();

    const listItems = page.locator("main li");
    const count = await listItems.count();
    const lastTwoTitles = await Promise.all(
      [count - 2, count - 1].map((i) => listItems.nth(i).innerText()),
    );
    expect(lastTwoTitles.join(" ")).toContain(titleA.split(" ").pop());
    expect(lastTwoTitles.join(" ")).toContain(titleB.split(" ").pop());
  });

  test("ajouter une tâche alors qu'une racine est déjà cochée : elle s'insère au-dessus après reload", async ({
    page,
  }) => {
    const completedTitle = `E2E ORD-DONE ${Date.now()}`;
    const newTitle = `E2E ORD-NEW ${Date.now()}`;
    cleanupTitles.push(completedTitle, newTitle);

    await page.getByLabel("Ajouter une tâche").fill(completedTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    const completedRow = page.locator("li", { hasText: completedTitle });
    await completedRow.locator('input[type="checkbox"]').check();
    await expect(page.getByLabel(`Déplacer "${completedTitle}"`)).toBeEnabled({
      timeout: 15_000,
    });

    await page.getByLabel("Ajouter une tâche").fill(newTitle);
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByLabel(`Déplacer "${newTitle}"`)).toBeEnabled({ timeout: 15_000 });

    await page.reload();

    // La nouvelle tâche doit apparaître AVANT la tâche complétée dans le DOM.
    const newIndex = await page.locator("main li", { hasText: newTitle }).evaluate((el) =>
      Array.from(el.parentElement!.children).indexOf(el),
    );
    const completedIndex = await page
      .locator("main li", { hasText: completedTitle })
      .evaluate((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(newIndex).toBeLessThan(completedIndex);
  });
});
