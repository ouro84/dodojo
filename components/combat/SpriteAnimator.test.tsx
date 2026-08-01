// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SpriteAnimator from "./SpriteAnimator";

afterEach(cleanup);

const base = {
  sheetSrc: "/sprites/mc/fire-knight/anim/idle.png",
  frames: 8,
  tileW: 96,
  tileH: 72,
  renderedHeight: 108,
  durationMs: 960,
  loop: true,
  animKey: "idle",
  ariaLabel: "Héros",
};

describe("SpriteAnimator", () => {
  it("dimensionne la tuile en conservant le ratio de la source", () => {
    render(<SpriteAnimator {...base} />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el).toHaveStyle({ height: "108px", width: "144px" });
  });

  it("étale la feuille sur frames tuiles et pose la borne d'animation", () => {
    render(<SpriteAnimator {...base} />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundSize).toBe("1152px 108px");
    expect(el.style.getPropertyValue("--sprite-end")).toBe("-1152px");
  });

  it("gèle l'animation quand frozen est vrai", () => {
    render(<SpriteAnimator {...base} frozen />);
    expect(screen.getByRole("img", { name: "Héros" })).toHaveStyle({
      animationPlayState: "paused",
    });
  });

  it("déclenche onImpact au prorata de impactFrame", () => {
    vi.useFakeTimers();
    const onImpact = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        frames={10}
        durationMs={600}
        impactFrame={4}
        onImpact={onImpact}
        animKey="atk1"
      />,
    );
    vi.advanceTimersByTime(239);
    expect(onImpact).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onImpact).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("décale onEnd du hit-stop annoncé", () => {
    vi.useFakeTimers();
    const onEnd = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        durationMs={600}
        extraDelayMs={200}
        onEnd={onEnd}
        animKey="atk1"
      />,
    );
    vi.advanceTimersByTime(799);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onEnd).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("fige la dernière tuile quand staticFrame vaut last", () => {
    render(<SpriteAnimator {...base} staticFrame="last" />);
    const el = screen.getByRole("img", { name: "Héros" });
    expect(el.style.backgroundPositionX).toBe("-1008px");
    expect(el.style.animationName).toBe("");
  });

  // Issue #146 : sous staticFrame (reduced-motion), onImpact/onEnd doivent
  // suivre les mêmes gardes que la branche animée (impactFrame !== null /
  // !loop) — sans elles, un remount d'un sprite idle (bouclé, sans
  // impactFrame) rappelait onImpact à tort. Pour le Boss (onImpact =
  // onBossImpact), ça remettait le héros en "hurt" en boucle sans rapport
  // avec une vraie attaque.
  it("n'appelle pas onImpact sous staticFrame quand l'anim n'a pas d'impactFrame (idle)", () => {
    const onImpact = vi.fn();
    render(<SpriteAnimator {...base} staticFrame="first" impactFrame={null} onImpact={onImpact} />);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it("appelle onImpact sous staticFrame quand l'anim a un impactFrame (attaque)", () => {
    const onImpact = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        staticFrame="first"
        impactFrame={4}
        onImpact={onImpact}
        animKey="atk1"
      />,
    );
    expect(onImpact).toHaveBeenCalledTimes(1);
  });

  it("n'appelle pas onEnd sous staticFrame quand l'anim est bouclée (idle)", () => {
    const onEnd = vi.fn();
    render(<SpriteAnimator {...base} staticFrame="first" loop onEnd={onEnd} />);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("appelle onEnd sous staticFrame quand l'anim n'est pas bouclée (hurt/death)", () => {
    const onEnd = vi.fn();
    render(
      <SpriteAnimator
        {...base}
        loop={false}
        staticFrame="last"
        onEnd={onEnd}
        animKey="hurt"
      />,
    );
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
