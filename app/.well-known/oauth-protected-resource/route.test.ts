import { describe, expect, test } from "vitest";

describe("GET /.well-known/oauth-protected-resource (US-22)", () => {
  test("retourne les metadonnees RFC 9728 basees sur l'origine de la requete", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://dodojo.vercel.app/.well-known/oauth-protected-resource"));
    const body = await response.json();
    expect(body).toMatchObject({
      resource: "https://dodojo.vercel.app/api/mcp",
      authorization_servers: ["https://dodojo.vercel.app"],
    });
  });
});
