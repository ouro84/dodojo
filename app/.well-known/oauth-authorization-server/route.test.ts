import { describe, expect, test } from "vitest";

describe("GET /.well-known/oauth-authorization-server (US-22)", () => {
  test("retourne les metadonnees RFC 8414 basees sur l'origine de la requete", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dodojo.vercel.app/.well-known/oauth-authorization-server"));
    const body = await response.json();
    expect(body).toMatchObject({
      issuer: "https://dodojo.vercel.app",
      authorization_endpoint: "https://dodojo.vercel.app/oauth/authorize",
      token_endpoint: "https://dodojo.vercel.app/oauth/token",
      code_challenge_methods_supported: ["S256"],
    });
  });
});
