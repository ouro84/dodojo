// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import TitleSelector from "./TitleSelector";

afterEach(cleanup);

const equipTitleMock = vi.fn<(code: string | null) => Promise<{ error: string | null }>>(
  async () => ({ error: null }),
);

vi.mock("@/app/actions/achievements", () => ({
  equipTitle: (code: string | null) => equipTitleMock(code),
}));

describe("TitleSelector", () => {
  test("rend un radiogroup accessible, pas un <select> natif", () => {
    render(<TitleSelector unlockedCodes={["FIRST_VICTORY"]} equippedCode={null} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Titre équipé" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2); // "Aucun" + FIRST_VICTORY
  });

  test("coche l'option équipée", () => {
    render(<TitleSelector unlockedCodes={["FIRST_VICTORY"]} equippedCode="FIRST_VICTORY" />);
    expect(screen.getByRole("radio", { name: "Aube" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Aucun" })).toHaveAttribute("aria-checked", "false");
  });

  test("clic sur une option appelle equipTitle et coche l'option", async () => {
    render(<TitleSelector unlockedCodes={["FIRST_VICTORY"]} equippedCode={null} />);
    fireEvent.click(screen.getByRole("radio", { name: "Aube" }));

    await waitFor(() => expect(equipTitleMock).toHaveBeenCalledWith("FIRST_VICTORY"));
    expect(screen.getByRole("radio", { name: "Aube" })).toHaveAttribute("aria-checked", "true");
  });

  test("flèche bas déplace le focus et sélectionne l'option suivante", async () => {
    render(
      <TitleSelector unlockedCodes={["FIRST_VICTORY", "STREAK_7"]} equippedCode={null} />,
    );
    const none = screen.getByRole("radio", { name: "Aucun" });
    none.focus();
    fireEvent.keyDown(none, { key: "ArrowDown" });

    const aube = screen.getByRole("radio", { name: "Aube" });
    expect(aube).toHaveFocus();
    await waitFor(() => expect(equipTitleMock).toHaveBeenCalledWith("FIRST_VICTORY"));
  });

  test("un seul radio est atteignable au Tab (roving tabindex)", () => {
    render(
      <TitleSelector unlockedCodes={["FIRST_VICTORY", "STREAK_7"]} equippedCode="STREAK_7" />,
    );
    expect(screen.getByRole("radio", { name: "Calme" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Aucun" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Aube" })).toHaveAttribute("tabindex", "-1");
  });

  test("affiche l'erreur et revient au titre équipé si equipTitle échoue", async () => {
    equipTitleMock.mockResolvedValueOnce({ error: "Ce titre n'est pas encore débloqué." });
    render(<TitleSelector unlockedCodes={["FIRST_VICTORY"]} equippedCode={null} />);
    fireEvent.click(screen.getByRole("radio", { name: "Aube" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/pas encore débloqué/));
    expect(screen.getByRole("radio", { name: "Aucun" })).toHaveAttribute("aria-checked", "true");
  });
});
