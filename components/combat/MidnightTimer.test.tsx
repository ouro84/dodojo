// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MidnightTimer from "./MidnightTimer";

afterEach(cleanup);

// Issue #194 : le label est passé d'un `useState(() => format...())` (évalué
// pendant le SSR, avec l'horloge/le fuseau du serveur → mismatch
// d'hydratation) à un store externe dont le snapshot serveur est un
// placeholder. Le risque introduit par ce correctif est l'inverse du bug :
// rester bloqué sur le placeholder si le store ne résout jamais côté client.
describe("MidnightTimer (issue #194)", () => {
  it("affiche une vraie durée après le montage, jamais le placeholder", () => {
    render(<MidnightTimer />);

    const label = screen.getByLabelText(/Temps restant avant minuit/);
    expect(label).toHaveTextContent(/^\d{2}:\d{2}$/);
    expect(label).not.toHaveTextContent("--:--");
  });

  it("reste cohérent entre le texte visible et l'annonce accessible", () => {
    render(<MidnightTimer />);

    const label = screen.getByLabelText(/Temps restant avant minuit/);
    const visible = label.textContent ?? "";
    expect(label).toHaveAttribute("aria-label", `Temps restant avant minuit : ${visible}`);
  });
});
