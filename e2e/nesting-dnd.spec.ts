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
    const handleB = page.getByLabel(`Déplacer "${titleB}"`);

    const targetBox = await rowA.boundingBox();
    const sourceBox = await handleB.boundingBox();
    if (!targetBox || !sourceBox) {
      throw new Error("Impossible de localiser les lignes de tâches pour le drag & drop.");
    }

    const sourceCenter = {
      x: sourceBox.x + sourceBox.width / 2,
      y: sourceBox.y + sourceBox.height / 2,
    };
    const targetCenter = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    };

    await page.mouse.move(sourceCenter.x, sourceCenter.y);
    await page.mouse.down();
    // Dépasse le seuil d'activation (distance: 8px) du PointerSensor dnd-kit.
    await page.mouse.move(sourceCenter.x, sourceCenter.y + 20, { steps: 5 });
    await page.mouse.move(targetCenter.x, targetCenter.y, { steps: 10 });
    await page.mouse.up();

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 30));
  });
});
