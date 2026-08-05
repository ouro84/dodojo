// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import VsIntroOverlay from "./VsIntroOverlay";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const base = {
  heroBustSrc: "/sprites/mc/fire-knight/bust.png",
  bossBustSrc: "/sprites/bosses/minotaur/bust.png",
  bossName: "Minotaure",
  isFirstEncounter: false,
  stakesLine: null as string | null,
};

describe("VsIntroOverlay", () => {
  it("affiche les portraits, puis VS, puis FIGHT! dans l'ordre scripté", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} onDone={() => {}} />);
    expect(screen.getByTestId("vs-intro-overlay")).toBeInTheDocument();
    expect(screen.queryByText("VS")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("VS")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1150); // cumulé 1600ms
    });
    expect(screen.getByText("FIGHT!")).toBeInTheDocument();
    expect(screen.queryByText("VS")).not.toBeInTheDocument();
  });

  it("appelle onDone une fois après la séquence complète (~3s)", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<VsIntroOverlay {...base} onDone={onDone} />);
    vi.advanceTimersByTime(2999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("n'appelle onDone qu'une seule fois même après 5s pleins (garde-fou sans double appel)", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<VsIntroOverlay {...base} onDone={onDone} />);
    vi.advanceTimersByTime(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("un dismiss anticipé (keydown) fait disparaître le contenu et appelle onDone rapidement", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<VsIntroOverlay {...base} onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(450);
    }); // en pleine phase VS
    fireEvent.keyDown(window, { key: "Enter" });
    vi.advanceTimersByTime(200);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("affiche le badge première rencontre pendant la phase VS", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} isFirstEncounter onDone={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("PREMIÈRE RENCONTRE")).toBeInTheDocument();
  });

  it("affiche la ligne d'enjeu quand fournie", () => {
    vi.useFakeTimers();
    render(<VsIntroOverlay {...base} stakesLine="Ta série est en jeu" onDone={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(screen.getByText("Ta série est en jeu")).toBeInTheDocument();
  });
});
