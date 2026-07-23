import { describe, expect, test } from "vitest";
import { parseOAuthRequestBody } from "./oauth-request-body";

describe("parseOAuthRequestBody (US-22)", () => {
  test("parse un corps application/x-www-form-urlencoded", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=authorization_code&code=abc123",
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({
      grant_type: "authorization_code",
      code: "abc123",
    });
  });

  test("parse un corps application/json", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: "xyz" }),
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({
      grant_type: "refresh_token",
      refresh_token: "xyz",
    });
  });

  test("ignore les champs JSON non-string", async () => {
    const request = new Request("http://localhost/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", extra: 42 }),
    });
    await expect(parseOAuthRequestBody(request)).resolves.toEqual({ grant_type: "authorization_code" });
  });
});
