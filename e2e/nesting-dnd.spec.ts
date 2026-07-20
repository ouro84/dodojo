import { test, expect } from "@playwright/test";
import { login } from "./fixtures";

// Scénario US-19 : glisser une tâche B sous une tâche A l'imbrique — son coût
// en HP passe alors de 20 à 10 (RG-01).
test.describe("Drag & Drop d'imbrication (US-19)", () => {
  let titleA: string | undefined;
  let titleB: string | undefined;

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne les tâches créées par le test.
    for (const title of [titleB, titleA]) {
      if (!title) continue;
      const abandonButton = page.getByLabel(`Abandonner "${title}"`);
      if (await abandonButton.count()) {
        await abandonButton.click();
      }
    }
    titleA = undefined;
    titleB = undefined;
  });

  test("glisser B sur A imbrique B sous A et réduit son coût à 10 HP", async ({ page }) => {
    titleA = `E2E A ${Date.now()}`;
    titleB = `E2E B ${Date.now()}`;

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    const input = page.getByLabel("Ajouter une tâche");
    const addButton = page.getByRole("button", { name: "Ajouter" });

    await input.fill(titleA);
    await addButton.click();
    await input.fill(titleB);
    await addButton.click();

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 40));

    const rowA = page.locator("li", { hasText: titleA });
    const rowB = page.locator("li", { hasText: titleB });
    const handleB = page.getByLabel(`Déplacer "${titleB}"`);

    // La poignée reste désactivée tant que l'id optimiste de la tâche n'a pas
    // été remplacé par le vrai id serveur (US-04/US-19, cf. isOptimisticTask).
    await expect(handleB).toBeEnabled();

    const rowABox = await rowA.boundingBox();
    const rowBBox = await rowB.boundingBox();
    const handleBox = await handleB.boundingBox();
    if (!rowABox || !rowBBox || !handleBox) {
      throw new Error("Impossible de localiser les lignes de tâches pour le drag & drop.");
    }

    // Déplacement purement vertical (delta = distance entre les deux lignes),
    // en partant du centre de la poignée de B. Un déplacement horizontal vers
    // le centre de la ligne A désaligne le rect traduit de la ligne draguée
    // (dnd-kit translate tout le rect de B par ce delta, pas seulement la
    // poignée) et fait échouer la détection de collision.
    const sourceCenter = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    const deltaY = rowBBox.y - rowABox.y;

    await page.mouse.move(sourceCenter.x, sourceCenter.y);
    await page.mouse.down();
    // Dépasse le seuil d'activation (distance: 8px) du PointerSensor dnd-kit.
    await page.mouse.move(sourceCenter.x, sourceCenter.y - 10, { steps: 5 });
    await page.mouse.move(sourceCenter.x, sourceCenter.y - deltaY, { steps: 15 });
    await page.mouse.up();

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 30));
  });
});
