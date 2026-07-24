// @vitest-environment jsdom
import { describe, expect, test, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ArticleMarkdown from "./ArticleMarkdown";

afterEach(cleanup);

describe("ArticleMarkdown", () => {
  test("rend un heading, un paragraphe et une liste", () => {
    render(<ArticleMarkdown contenu={"## Titre\n\nUn paragraphe.\n\n- Un\n- Deux"} />);
    expect(screen.getByRole("heading", { name: "Titre", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Un paragraphe.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("lien interne utilise next/link, sans target=_blank", () => {
    render(<ArticleMarkdown contenu={"[Retour](/guide)"} />);
    const lien = screen.getByRole("link", { name: "Retour" });
    expect(lien).toHaveAttribute("href", "/guide");
    expect(lien).not.toHaveAttribute("target");
  });

  test("lien externe ouvre dans un nouvel onglet", () => {
    render(<ArticleMarkdown contenu={"[Externe](https://example.com)"} />);
    expect(screen.getByRole("link", { name: "Externe" })).toHaveAttribute("target", "_blank");
  });
});
