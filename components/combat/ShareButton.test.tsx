// @vitest-environment jsdom
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ShareButton from "./ShareButton";
import type { ShareCardParams } from "@/lib/share-card";

// Pas de `globals: true` dans vitest.config.ts (describe/test importés explicitement,
// cohérent avec lib/**/*.test.ts) → le cleanup auto de Testing Library (qui détecte un
// afterEach global) ne se déclenche pas seul, nettoyage explicite requis entre tests.
afterEach(cleanup);

vi.mock("@/app/actions/share", () => ({
  logShareEvent: vi.fn(async () => ({ error: null })),
}));

const params: ShareCardParams = {
  username: "Ada",
  heroId: "fire_knight",
  bossId: "frost-guardian",
  outcome: "victory",
  damageDealt: 80,
  xpEarned: 120,
  tasksCompleted: 4,
  streak: 5,
  level: 4,
  title: "",
  dayDate: "2026-07-22",
  milestone: null,
};

describe("ShareButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn(
      async () => new Response(new Blob(["fake-png"], { type: "image/png" }), { status: 200 }),
    ) as unknown as typeof fetch;
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
  });

  test("déclenche l'appel réseau vers la route de génération au clic", async () => {
    render(<ShareButton params={params} source="perfect_overlay" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const calledUrl = String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(calledUrl).toContain("/api/share-card?");
    expect(calledUrl).toContain("username=Ada");
  });

  test("fallback téléchargement quand navigator.share est absent (jsdom ne l'implémente pas)", async () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    render(<ShareButton params={params} source="perfect_overlay" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
  });

  test("affiche une erreur si la génération échoue", async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    render(<ShareButton params={params} source="crepuscule" />);
    fireEvent.click(screen.getByRole("button", { name: /partager/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/impossible/i));
  });
});
