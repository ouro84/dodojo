import { expect, test } from "@playwright/test";
import { login, resetShopState } from "./fixtures";

// US-53 / issue #75 : parcours tenues via le carrousel 3D (remplace l'ancienne
// bande de pastilles de couleur, cf. CLAUDE.md § Tenues/skins des héros).
// Compte e2e fixe partagé → reset avant chaque test.
test.describe("US-53 Tenues (carrousel)", () => {
  test.beforeEach(async ({ page }) => {
    await resetShopState();
    await login(page);
  });

  test("héros verrouillé : carrousel navigable en lecture seule, pas de CTA d'achat", async ({
    page,
  }) => {
    await page.goto("/marche-noir");
    await page.locator('[data-hero-cell="water_priestess"]').click();

    const carousel = page.getByTestId("skin-carousel");
    await expect(carousel).toHaveAttribute("data-hero", "water_priestess");
    await expect(page.getByTestId("skin-cta")).toHaveCount(0);
    await expect(page.getByText("Débloque le héros d'abord")).toBeVisible();
    // Q19 du grilling : la navigation reste possible même héros verrouillé.
    await expect(page.getByLabel("Tenue suivante")).toBeEnabled();
  });

  test("achète puis équipe une tenue alternative du héros par défaut", async ({ page }) => {
    await page.goto("/marche-noir");
    // Fire Knight (possédé/équipé par défaut) déjà sélectionné, tenue Défaut centrée.
    await expect(page.getByTestId("skin-cta")).toHaveText("✓ Équipé");

    await page.getByLabel("Tenue suivante").click();
    await expect(page.getByTestId("skin-position")).toHaveText("2/2");
    await expect(page.getByTestId("skin-cta")).toHaveText("300 · Débloquer");

    await page.getByTestId("skin-cta").click();
    await page.getByRole("dialog", { name: "Confirmer l'achat de la tenue" }).waitFor();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(page.getByTestId("skin-cta")).toHaveText("Équiper");
    await page.getByTestId("skin-cta").click();
    await expect(page.getByTestId("skin-cta")).toHaveText("✓ Équipé");
    await expect(page.getByTestId("skin-equipped-badge")).toBeVisible();
  });

  test("la tenue par défaut n'affiche jamais de prix, même après avoir navigué ailleurs", async ({
    page,
  }) => {
    await page.goto("/marche-noir");
    await page.getByLabel("Tenue suivante").click();
    await expect(page.getByTestId("skin-position")).toHaveText("2/2");

    await page.getByLabel("Tenue précédente").click();
    await expect(page.getByTestId("skin-position")).toHaveText("1/2");
    // Toujours possédée (US-53 D4) : jamais "Débloquer"/un prix, seulement
    // Équipé (déjà le cas par défaut) ou Équiper.
    await expect(page.getByTestId("skin-cta")).toHaveText("✓ Équipé");
  });

  test("navigation clavier (flèches) jusqu'à une tenue verrouillée, achat, équipement", async ({
    page,
  }) => {
    await page.goto("/marche-noir");
    await page.locator('[data-hero-cell="crystal_mauler"]').click();
    await page.getByTestId("hero-cta").click(); // achat du héros
    await page.getByRole("button", { name: "Confirmer" }).click();
    // Devient possédé → le CTA héros disparaît, seul le CTA de tenue équipe
    // désormais héros + tenue en une action (issue #183).
    await expect(page.getByTestId("hero-cta")).toHaveCount(0);
    await expect(page.getByTestId("skin-cta")).toHaveText("Équiper");
    await page.getByTestId("skin-cta").click();
    await expect(page.getByTestId("skin-cta")).toHaveText("✓ Équipé");

    const group = page.getByRole("group", { name: "Tenues de Broyeur de Cristal" });
    await group.focus();
    await group.press("ArrowRight");
    await expect(page.getByTestId("skin-position")).toHaveText("2/4");
    await expect(page.getByTestId("skin-cta")).toHaveText("300 · Débloquer");

    await page.getByTestId("skin-cta").click();
    await page.getByRole("dialog", { name: "Confirmer l'achat de la tenue" }).waitFor();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByTestId("skin-cta")).toHaveText("Équiper");

    await page.getByTestId("skin-cta").click();
    await expect(page.getByTestId("skin-cta")).toHaveText("✓ Équipé");

    await group.press("ArrowLeft");
    await expect(page.getByTestId("skin-position")).toHaveText("1/4");
  });
});
