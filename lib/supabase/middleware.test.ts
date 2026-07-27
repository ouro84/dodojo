import { describe, expect, test } from "vitest";

// updateSession dépend de next/server (NextRequest/NextResponse) et de
// createServerClient — non instanciable simplement hors runtime Next.js.
// On teste ici uniquement la règle isPublicRoute, extraite en fonction pure
// pour rester testable.
import { isPublicRoute } from "./middleware";

describe("isPublicRoute (garde de session proxy.ts)", () => {
  test("/login et /welcome restent publics", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/welcome")).toBe(true);
  });

  test("toute route sous /api/ est publique (auth par mécanisme propre)", () => {
    expect(isPublicRoute("/api/cron/push-reminders")).toBe(true);
    expect(isPublicRoute("/api/webhook/add-task")).toBe(true);
  });

  test("les routes applicatives normales restent protégées", () => {
    expect(isPublicRoute("/")).toBe(false);
    expect(isPublicRoute("/vestiaire")).toBe(false);
  });

  test("/oauth/* et /.well-known/* sont publics (US-22 : Gemini n'a pas de cookie Supabase)", () => {
    expect(isPublicRoute("/oauth/register")).toBe(true);
    expect(isPublicRoute("/oauth/authorize")).toBe(true);
    expect(isPublicRoute("/api/mcp")).toBe(true);
    expect(isPublicRoute("/.well-known/oauth-authorization-server")).toBe(true);
  });
});
