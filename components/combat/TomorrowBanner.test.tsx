// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TomorrowBanner from "./TomorrowBanner";

afterEach(cleanup);

describe("TomorrowBanner", () => {
  it("affiche 'rien de prévu' quand count vaut 0", () => {
    render(<TomorrowBanner count={0} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain — rien de prévu")).toBeInTheDocument();
  });

  it("affiche le singulier pour 1 tâche", () => {
    render(<TomorrowBanner count={1} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain · 1 tâche")).toBeInTheDocument();
  });

  it("affiche le pluriel pour plusieurs tâches", () => {
    render(<TomorrowBanner count={3} onOpen={vi.fn()} />);
    expect(screen.getByText("Demain · 3 tâches")).toBeInTheDocument();
  });

  it("appelle onOpen au clic", () => {
    const onOpen = vi.fn();
    render(<TomorrowBanner count={2} onOpen={onOpen} />);
    screen.getByRole("button", { name: /^Demain/ }).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
