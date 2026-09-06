import { describe, expect, test } from "vitest";
import { buildAuthorizationServerMetadata, buildProtectedResourceMetadata } from "./oauth-metadata";

describe("buildAuthorizationServerMetadata (RFC 8414)", () => {
  test("construit les endpoints a partir de l'origine", () => {
    expect(buildAuthorizationServerMetadata("https://dodojo.vercel.app")).toEqual({
      issuer: "https://dodojo.vercel.app",
      authorization_endpoint: "https://dodojo.vercel.app/oauth/authorize",
      token_endpoint: "https://dodojo.vercel.app/oauth/token",
      registration_endpoint: "https://dodojo.vercel.app/oauth/register",
      revocation_endpoint: "https://dodojo.vercel.app/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe("buildProtectedResourceMetadata (RFC 9728)", () => {
  test("pointe vers /api/mcp et l'origine comme serveur d'autorisation", () => {
    expect(buildProtectedResourceMetadata("https://dodojo.vercel.app")).toEqual({
      resource: "https://dodojo.vercel.app/api/mcp",
      authorization_servers: ["https://dodojo.vercel.app"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["tasks:read", "tasks:write", "profile:read", "profile:write"],
    });
  });
});
