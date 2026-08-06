// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BossBar from "./BossBar";

afterEach(cleanup);

describe("BossBar", () => {
  it("affiche le nom et les HP dans la barre", () => {
    render(<BossBar bossName="Minotaure" currentHp={80} maxHp={100} completedCount={2} xpEarned={60} />);
    expect(screen.getByText("Minotaure")).toBeInTheDocument();
    expect(screen.getByText("80/100 HP")).toBeInTheDocument();
  });

  it("ouvre un dialog au clic avec nom, HP, tâches validées et XP", () => {
    render(<BossBar bossName="Minotaure" currentHp={80} maxHp={100} completedCount={2} xpEarned={60} />);
    fireEvent.click(screen.getByRole("button", { name: /Minotaure/ }));
    const dialog = screen.getByRole("dialog", { name: /Détail du Boss Minotaure/ });
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toMatch(/80/);
    expect(dialog.textContent).toMatch(/100/);
    expect(dialog).toHaveTextContent("2");
    expect(dialog).toHaveTextContent("+60");
  });

  it("referme le dialog au clic extérieur", () => {
    render(
      <div>
        <BossBar bossName="Minotaure" currentHp={80} maxHp={100} completedCount={0} xpEarned={0} />
        <button>Hors</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Minotaure/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("Hors"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
