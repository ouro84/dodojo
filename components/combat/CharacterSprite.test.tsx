// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CharacterSprite from "./CharacterSprite";
import type { CharacterSpriteMeta } from "@/lib/sprite-metadata";

afterEach(cleanup);

const meta: CharacterSpriteMeta = {
  tileW: 96,
  tileH: 72,
  renderScale: 1.5,
  groundOffset: 0.1,
  anims: {
    idle: { frames: 8, impactFrame: null },
    atk1: { frames: 10, impactFrame: 4 },
    hurt: { frames: 6, impactFrame: null },
    death: { frames: 12, impactFrame: null },
  },
};

const base = {
  spriteBase: "/sprites/mc/fire-knight",
  meta,
  baseHeight: 88,
  stateKey: 1,
  alt: "Héros",
};

describe("CharacterSprite", () => {
  it("applique renderScale et groundOffset à la géométrie", () => {
    render(<CharacterSprite {...base} state="idle" />);
    // 88 × 1.5 = 132 px de haut, décalé de 0.1 × 132 = 13.2 px vers le bas.
    const wrapper = screen.getByTestId("character-sprite");
    expect(wrapper).toHaveStyle({ transform: "translateY(13.2px)" });
    expect(screen.getByRole("img", { name: "Héros" })).toHaveStyle({ height: "132px" });
  });

  it("expose l'état courant pour les assertions e2e", () => {
    render(<CharacterSprite {...base} state="attack" attackAnim="atk1" />);
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "attack");
  });

  it("revient à idle à la fin d'une anim non bouclée", () => {
    vi.useFakeTimers();
    render(<CharacterSprite {...base} state="attack" attackAnim="atk1" />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "idle");
    vi.useRealTimers();
  });

  it("reste figé sur death", () => {
    vi.useFakeTimers();
    render(<CharacterSprite {...base} state="death" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-state", "death");
    vi.useRealTimers();
  });

  it("retombe sur l'idle quand une anim manque (minotaur)", () => {
    const partial: CharacterSpriteMeta = {
      ...meta,
      anims: { idle: { frames: 8, impactFrame: null } },
    };
    render(<CharacterSprite {...base} meta={partial} state="hurt" fallbackHurtDeath />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundImage).toContain("/anim/idle.png");
    expect(screen.getByTestId("character-sprite")).toHaveAttribute("data-anim-fallback", "true");
  });

  it("alias state=hurt vers l'anim take_hit d'un héros (pas de clé hurt)", () => {
    const heroMeta: CharacterSpriteMeta = {
      ...meta,
      anims: { idle: { frames: 8, impactFrame: null }, take_hit: { frames: 5, impactFrame: null } },
    };
    render(<CharacterSprite {...base} meta={heroMeta} state="hurt" />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundImage).toContain("/anim/take_hit.png");
    expect(screen.getByTestId("character-sprite")).not.toHaveAttribute("data-anim-fallback");
  });
});
