import { expect, test } from "@playwright/test";
import { login } from "./fixtures";

// Issue #167 : sur desktop, un fond décoratif étendu (rail → bord du
// viewport) doit suivre le décor RÉEL du jour (16 variantes / 7 thèmes,
// lib/backgrounds.ts, résolu une fois par resolveDailyBoss) — jamais un
// asset figé (ex. l'ancien réflexe "gradient steampunk générique"). On le
// vérifie en comparant le `src` du fond étendu à celui du cabinet
// (VersusScene), qui affiche déjà, lui, le décor du jour : un désync entre
// les deux prouve qu'un des deux chemins a été codé en dur.
test.use({ viewport: { width: 1440, height: 900 } });

// next/image (optimisation prod active, aucun `images.unoptimized` dans
// next.config.ts) réécrit `src` en `/_next/image?url=<encodé>&w=...&q=...` —
// le `w` peut différer entre les deux éléments (tailles rendues différentes,
// cf. `sizes`), donc on compare le paramètre `url` décodé, jamais le `src` brut.
function decodedImageUrlParam(src: string): string {
  const url = new URL(src, "http://localhost");
  const param = url.searchParams.get("url");
  return param ? decodeURIComponent(param) : src;
}

test.describe("Fond décoratif étendu de l'Arène desktop (issue #167)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("le fond étendu affiche le même décor que le cabinet, quel que soit le boss du jour", async ({
    page,
  }) => {
    const backdrop = page.getByTestId("arena-backdrop");
    const cabinet = page.getByTestId("versus-scene-backdrop");

    await expect(backdrop).toBeVisible();
    await expect(cabinet).toBeVisible();

    const backdropSrc = await backdrop.getAttribute("src");
    const cabinetSrc = await cabinet.getAttribute("src");
    if (!backdropSrc || !cabinetSrc) throw new Error("Image de décor sans src");

    const backdropPath = decodedImageUrlParam(backdropSrc);
    const cabinetPath = decodedImageUrlParam(cabinetSrc);

    expect(backdropPath).toBe(cabinetPath);
    // Un décor réel de lib/backgrounds.ts, jamais un placeholder oublié.
    expect(backdropPath).toMatch(/^\/backgrounds\/[a-z0-9-]+\.png$/);
  });

  test("le fond étendu reste masqué sur mobile (comportement <1024px inchangé)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("arena-backdrop")).toBeHidden();
  });
});
