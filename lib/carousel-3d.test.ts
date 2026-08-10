import { describe, expect, it } from "vitest";
import { carousel3DTransform, skinCtaState, stepCarouselIndex } from "./carousel-3d";

describe("carousel3DTransform", () => {
  it("au centre (offset 0) : pleine échelle, pleine opacité, z-index le plus haut", () => {
    const t = carousel3DTransform(0);
    expect(t.opacity).toBe(1);
    expect(t.transform).toContain("scale(1)");
    expect(t.zIndex).toBeGreaterThan(carousel3DTransform(1).zIndex);
  });

  it("symétrique : offset et -offset ont la même opacité/échelle/z-index, transform en miroir", () => {
    const left = carousel3DTransform(-1);
    const right = carousel3DTransform(1);
    expect(left.opacity).toBe(right.opacity);
    expect(left.zIndex).toBe(right.zIndex);
    // rotateY et translateX doivent être de signe opposé (miroir), même magnitude
    const rotateLeft = /rotateY\((-?[\d.]+)deg\)/.exec(left.transform)?.[1];
    const rotateRight = /rotateY\((-?[\d.]+)deg\)/.exec(right.transform)?.[1];
    expect(Number(rotateLeft)).toBeCloseTo(-Number(rotateRight!), 5);
  });

  it("plus l'offset est grand, plus on recule en profondeur (translateZ plus négatif)", () => {
    const near = carousel3DTransform(1);
    const far = carousel3DTransform(2);
    const zNear = Number(/translateZ\((-?[\d.]+)px\)/.exec(near.transform)?.[1]);
    const zFar = Number(/translateZ\((-?[\d.]+)px\)/.exec(far.transform)?.[1]);
    expect(zFar).toBeLessThan(zNear);
  });

  it("au-delà de la plage visible, opacité à 0 (tenue masquée, pas de fuite visuelle)", () => {
    expect(carousel3DTransform(3).opacity).toBe(0);
    expect(carousel3DTransform(-3).opacity).toBe(0);
  });

  it("jamais d'opacité négative ni de scale négatif même très loin du centre", () => {
    const t = carousel3DTransform(50);
    expect(t.opacity).toBeGreaterThanOrEqual(0);
    expect(t.transform).not.toContain("scale(-");
  });
});

describe("skinCtaState", () => {
  it("tenue équipée : CTA désactivé, libellé ✓ Équipé", () => {
    const state = skinCtaState({ equipped: true, owned: true, price: 300, balance: 1000 });
    expect(state).toEqual({ label: "✓ Équipé", disabled: true, variant: "equipped", icon: null });
  });

  it("tenue possédée mais pas équipée : CTA actif, libellé Équiper", () => {
    const state = skinCtaState({ equipped: false, owned: true, price: 300, balance: 1000 });
    expect(state).toEqual({ label: "Équiper", disabled: false, variant: "equip", icon: null });
  });

  it("tenue non possédée, solde suffisant : CTA actif, débloquer au prix affiché", () => {
    const state = skinCtaState({ equipped: false, owned: false, price: 300, balance: 300 });
    expect(state).toEqual({
      label: "300 · Débloquer",
      disabled: false,
      variant: "unlock",
      icon: "gold",
    });
  });

  it("tenue non possédée, solde insuffisant : CTA désactivé (issue #75, trou UX corrigé)", () => {
    const state = skinCtaState({ equipped: false, owned: false, price: 300, balance: 100 });
    expect(state).toEqual({
      label: "300 · Or insuffisant",
      disabled: true,
      variant: "insufficient",
      icon: "gold",
    });
  });

  it("tenue default (price 0) toujours possédée : jamais l'état or insuffisant", () => {
    const state = skinCtaState({ equipped: false, owned: true, price: 0, balance: 0 });
    expect(state.variant).toBe("equip");
  });
});

describe("stepCarouselIndex", () => {
  it("avance/recule dans les bornes sans boucle (3+ tenues)", () => {
    expect(stepCarouselIndex({ current: 0, direction: 1, total: 4, loop: false })).toBe(1);
    expect(stepCarouselIndex({ current: 3, direction: 1, total: 4, loop: false })).toBe(3);
    expect(stepCarouselIndex({ current: 0, direction: -1, total: 4, loop: false })).toBe(0);
  });

  it("cas dégénéré à 2 tenues : swiper dans un sens ou l'autre bascule avant/arrière (issue #75, Q18)", () => {
    expect(stepCarouselIndex({ current: 0, direction: 1, total: 2, loop: true })).toBe(1);
    expect(stepCarouselIndex({ current: 0, direction: -1, total: 2, loop: true })).toBe(1);
    expect(stepCarouselIndex({ current: 1, direction: 1, total: 2, loop: true })).toBe(0);
    expect(stepCarouselIndex({ current: 1, direction: -1, total: 2, loop: true })).toBe(0);
  });

  it("une seule tenue : reste sur place quelle que soit la direction", () => {
    expect(stepCarouselIndex({ current: 0, direction: 1, total: 1, loop: false })).toBe(0);
    expect(stepCarouselIndex({ current: 0, direction: -1, total: 1, loop: false })).toBe(0);
  });
});
