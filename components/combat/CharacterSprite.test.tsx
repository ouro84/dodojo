// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CharacterSprite from "./CharacterSprite";
import type { CharacterSpriteMeta } from "@/lib/sprite-metadata";
import { HURT_DURATION_MS } from "@/lib/combat-animation";

afterEach(cleanup);

const meta: CharacterSpriteMeta = {
  tileW: 96,
  tileH: 72,
  renderScale: 1.5,
  groundOffset: 0.1,
  idleAnchorX: 0.5,
  idleWidthRatio: 0.5,
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
    render(<CharacterSprite {...base} meta={partial} state="hurt" />);
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

  it("pose le flash blanc sur l'état hurt", () => {
    render(<CharacterSprite {...base} state="hurt" />);
    expect(screen.getByTestId("character-flash")).toHaveClass("white-flash");
  });

  it("ne pose aucun flash hors de l'état hurt", () => {
    render(<CharacterSprite {...base} state="idle" />);
    expect(screen.getByTestId("character-flash")).not.toHaveClass("white-flash");
  });

  it("ne pose aucun flash sous reduced-motion", () => {
    render(<CharacterSprite {...base} state="hurt" reducedMotion />);
    expect(screen.getByTestId("character-flash")).not.toHaveClass("white-flash");
  });

  it("le flash suit `rendered`, pas la prop `state` reçue du parent (issue #156)", () => {
    // `heroAnim`/`bossAnim` côté Arena ne repassent pas forcément à "idle"
    // tout seuls après un coup (cf. issue #149) — le flash ne doit donc pas
    // dépendre de la prop `state` telle quelle, mais de `rendered`, qui se
    // corrige toujours via `onEnd` une fois l'anim non bouclée terminée.
    vi.useFakeTimers();
    render(<CharacterSprite {...base} state="hurt" />);
    expect(screen.getByTestId("character-flash")).toHaveClass("white-flash");
    act(() => {
      vi.advanceTimersByTime(HURT_DURATION_MS);
    });
    expect(screen.getByTestId("character-flash")).not.toHaveClass("white-flash");
    vi.useRealTimers();
  });
});
