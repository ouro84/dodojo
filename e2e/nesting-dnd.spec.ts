import { test, expect, type Locator, type Page } from "@playwright/test";
import { abandonViaUi, login } from "./fixtures";

// Scénario US-19 : le drag & drop distingue deux gestes selon la moitié de
// ligne survolée — moitié basse d'une tâche racine = imbrication (RG-01,
// 10 HP au lieu de 20) ; moitié haute de n'importe quelle ligne = réordonne
// au même niveau que la cible, ce qui permet aussi de repromouvoir une
// sous-tâche en tâche (dé-nesting) en la déposant sur la moitié haute d'une
// tâche racine.

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function dragOnto(
  page: Page,
  handle: Locator,
  draggedRowBox: Box,
  targetRowBox: Box,
  yFraction: number,
): Promise<void> {
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Poignée introuvable pour le drag & drop.");

  const handleCenter = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const draggedCenterY = draggedRowBox.y + draggedRowBox.height / 2;
  const desiredCenterY = targetRowBox.y + targetRowBox.height * yFraction;
  const deltaY = desiredCenterY - draggedCenterY;
  const finalY = handleCenter.y + deltaY;

  await page.mouse.move(handleCenter.x, handleCenter.y);
  await page.mouse.down();
  // Dépasse le seuil d'activation (distance: 8px) du PointerSensor dnd-kit.
  await page.mouse.move(handleCenter.x, handleCenter.y - 10, { steps: 5 });
  await page.mouse.move(handleCenter.x, finalY, { steps: 15 });
  await page.mouse.up();
}

test.describe("Drag & Drop d'imbrication et de réordonnancement (US-19)", () => {
  const cleanupTitles: string[] = [];

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // RG-04 : jamais de suppression — on abandonne les tâches créées par le test.
    for (const title of cleanupTitles.splice(0)) {
      await abandonViaUi(page, title);
    }
  });

  test("glisser B sur la moitié basse de A imbrique B sous A (10 HP)", async ({ page }) => {
    const titleA = `E2E A ${Date.now()}`;
    const titleB = `E2E B ${Date.now()}`;
    cleanupTitles.push(titleA, titleB);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    const input = page.getByLabel("Ajouter une tâche");
    const addButton = page.getByRole("button", { name: "Ajouter" });

    await input.fill(titleA);
    await addButton.click();
    // Attendre la confirmation serveur de A avant de créer B : sinon le
    // calcul de position de B peut ne pas encore voir A (course avec
    // l'insert de A), et l'ordre de liste devient imprévisible.
    await expect(page.getByLabel(`Déplacer "${titleA}"`)).toBeEnabled();
    await input.fill(titleB);
    await addButton.click();

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 40));

    const rowA = page.locator("li", { hasText: titleA });
    const rowB = page.locator("li", { hasText: titleB });
    const handleA = page.getByLabel(`Déplacer "${titleA}"`);
    const handleB = page.getByLabel(`Déplacer "${titleB}"`);
    await expect(handleA).toBeEnabled();
    await expect(handleB).toBeEnabled();

    const rowABox = await rowA.boundingBox();
    const rowBBox = await rowB.boundingBox();
    if (!rowABox || !rowBBox) throw new Error("Lignes introuvables.");

    await dragOnto(page, handleB, rowBBox, rowABox, 0.85);

    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 30));
  });

  test("glisser C sur la moitié haute de A le réordonne avant A (pas d'imbrication)", async ({
    page,
  }) => {
    const titleA = `E2E A ${Date.now()}`;
    const titleB = `E2E B ${Date.now()}`;
    const titleC = `E2E C ${Date.now()}`;
    cleanupTitles.push(titleA, titleB, titleC);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    const input = page.getByLabel("Ajouter une tâche");
    const addButton = page.getByRole("button", { name: "Ajouter" });

    await input.fill(titleA);
    await addButton.click();
    await expect(page.getByLabel(`Déplacer "${titleA}"`)).toBeEnabled();
    await input.fill(titleB);
    await addButton.click();
    await expect(page.getByLabel(`Déplacer "${titleB}"`)).toBeEnabled();
    await input.fill(titleC);
    await addButton.click();

    const rowA = page.locator("li", { hasText: titleA });
    const rowC = page.locator("li", { hasText: titleC });
    const handleA = page.getByLabel(`Déplacer "${titleA}"`);
    const handleC = page.getByLabel(`Déplacer "${titleC}"`);
    await expect(handleA).toBeEnabled();
    await expect(handleC).toBeEnabled();

    const rowABox = await rowA.boundingBox();
    const rowCBox = await rowC.boundingBox();
    if (!rowABox || !rowCBox) throw new Error("Lignes introuvables.");

    await dragOnto(page, handleC, rowCBox, rowABox, 0.15);

    // Aucune imbrication : les HP max ne bougent pas (toujours 3 × 20 HP).
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 60));

    const allTexts = await page.locator("li").allInnerTexts();
    const indexC = allTexts.findIndex((t) => t.includes(titleC));
    const indexA = allTexts.findIndex((t) => t.includes(titleA));
    const indexB = allTexts.findIndex((t) => t.includes(titleB));
    expect(indexC).toBeGreaterThanOrEqual(0);
    expect(indexC).toBeLessThan(indexA);
    expect(indexA).toBeLessThan(indexB);
  });

  test("glisser une sous-tâche sur la moitié haute d'une tâche racine la repromeut en tâche", async ({
    page,
  }) => {
    const titleA = `E2E A ${Date.now()}`;
    const titleA1 = `E2E A1 ${Date.now()}`;
    const titleB = `E2E B ${Date.now()}`;
    cleanupTitles.push(titleA, titleA1, titleB);

    const bossBar = page.getByRole("progressbar", { name: /Vie du Boss/ });
    const initialMaxHp = Number(await bossBar.getAttribute("aria-valuemax"));

    const input = page.getByLabel("Ajouter une tâche");
    const addButton = page.getByRole("button", { name: "Ajouter" });

    await input.fill(titleA);
    await addButton.click();
    // Attendre la confirmation serveur de A avant de créer la suite : sinon
    // le calcul de position de la tâche suivante peut ne pas encore voir A
    // (course avec l'insert de A), et l'ordre de liste devient imprévisible.
    await expect(page.getByLabel(`Déplacer "${titleA}"`)).toBeEnabled();

    const rowA = page.locator("li", { hasText: titleA });
    await rowA.getByLabel("Diviser en sous-tâche").click();
    await page.getByLabel("Ajouter une sous-tâche").fill(titleA1);
    await page.getByLabel("Ajouter une sous-tâche").press("Enter");

    const handleA1 = page.getByLabel(`Déplacer "${titleA1}"`);
    await expect(handleA1).toBeEnabled();

    await input.fill(titleB);
    await addButton.click();

    // A (20) + A1 sous-tâche (10) + B (20) = +50 avant le drag.
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 50));

    const rowB = page.locator("li", { hasText: titleB });
    const rowA1 = page.locator("li", { hasText: titleA1 });
    const handleB = page.getByLabel(`Déplacer "${titleB}"`);
    await expect(handleB).toBeEnabled();
    await rowA1.scrollIntoViewIfNeeded();
    await rowB.scrollIntoViewIfNeeded();

    const rowA1Box = await rowA1.boundingBox();
    const rowBBox = await rowB.boundingBox();
    if (!rowA1Box || !rowBBox) throw new Error("Lignes introuvables.");

    await dragOnto(page, handleA1, rowA1Box, rowBBox, 0.15);

    // A1 devient une tâche racine (20 HP au lieu de 10) : +10 HP net.
    await expect(bossBar).toHaveAttribute("aria-valuemax", String(initialMaxHp + 60));
  });
});
