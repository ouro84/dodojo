// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EquippedTitlePreview from "./EquippedTitlePreview";

afterEach(cleanup);

describe("EquippedTitlePreview", () => {
  test("affiche 'Aucun titre équipé' quand titleCode est null", () => {
    render(<EquippedTitlePreview titleCode={null} />);
    expect(screen.getByText(/Aucun titre équipé/)).toBeInTheDocument();
  });

  test("affiche 'Aucun titre équipé' quand le code est inconnu du catalogue", () => {
    render(<EquippedTitlePreview titleCode="code-inexistant-xyz" />);
    expect(screen.getByText(/Aucun titre équipé/)).toBeInTheDocument();
  });

  test("résout le libellé du titre depuis le catalogue (ex: streak 7 jours 'Calme')", () => {
    render(<EquippedTitlePreview titleCode="STREAK_7" />);
    expect(screen.getByText(/Calme/)).toBeInTheDocument();
  });

  test("affiche toujours un lien vers /tableau-de-chasse/succes", () => {
    render(<EquippedTitlePreview titleCode={null} />);
    expect(screen.getByRole("link", { name: /Changer/ })).toHaveAttribute(
      "href",
      "/tableau-de-chasse/succes",
    );
  });
});
